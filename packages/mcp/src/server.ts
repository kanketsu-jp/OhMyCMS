import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  isOhMyCmsError,
  type FilterObject,
  type ItemsQuery,
  type OhMyCmsClient,
} from "@ohmycms/sdk";
import { run } from "./result.js";
import * as S from "./schemas.js";

export const SERVER_NAME = "ohmycms";
export const SERVER_VERSION = "0.1.0";

function columnsOf(collection: {
  collection: string;
  meta: { note: string | null } | null;
  schema: { columns: { name: string; data_type: string; is_nullable: boolean; is_primary_key: boolean }[] } | null;
}) {
  return {
    collection: collection.collection,
    note: collection.meta?.note ?? null,
    columns:
      collection.schema?.columns.map((column) => ({
        name: column.name,
        data_type: column.data_type,
        is_nullable: column.is_nullable,
        is_primary_key: column.is_primary_key,
      })) ?? [],
  };
}

/**
 * ツールを登録したサーバを作る。
 *
 * 設計の原則（旧PJの調査結論。仕様 §4）:
 * - **検索プリミティブ 1 つ = ツール 1 つ。** 何でもやる万能ツールを作らない
 * - **サーバ側に LLM を持たない。** ここは REST を叩いて JSON を返すだけ
 * - 出力は `outputSchema` で型を強制する
 *
 * 権限について:
 * - **判定は API 側に任せる。** MCP は 403 / 404 をそのまま返す
 * - 「管理者のときだけ使えるツール」も、MCP 側では区別せず全部登録する。
 *   成否は API が決める（MCP が判定すると権限が二重実装になる）
 */
export function createServer(client: OhMyCmsClient): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  /* ------------------------------------------------------------------ *
   * 疎通
   * ------------------------------------------------------------------ */

  server.registerTool(
    "ohmycms_health",
    {
      title: "疎通確認",
      description: "OhMyCMS の API に繋がるか、DB まで到達できているかを確認する。認証は不要。",
      inputSchema: S.EMPTY_INPUT,
      outputSchema: S.HEALTH_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => ({ ...(await client.health()), url: client.baseUrl })),
  );

  /* ------------------------------------------------------------------ *
   * スキーマ（読み取り）
   * ------------------------------------------------------------------ */

  server.registerTool(
    "ohmycms_collections_list",
    {
      title: "コレクション一覧",
      description:
        "コレクション（テーブル）の一覧と各列を返す。管理系の権限が要る（トークンの capabilities に schema:read が必要）。",
      inputSchema: S.COLLECTIONS_LIST_INPUT,
      outputSchema: S.COLLECTIONS_LIST_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ include_system }) =>
      run(async () => {
        const rows = await client.collections.list({ system: include_system === true });
        return { collections: rows.map(columnsOf), count: rows.length };
      }),
  );

  server.registerTool(
    "ohmycms_collection_get",
    {
      title: "コレクションを1つ取る",
      description: "指定したコレクションの定義（列・メモ）を返す。schema:read が必要。",
      inputSchema: S.COLLECTION_GET_INPUT,
      outputSchema: S.COLLECTION_GET_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ collection }) =>
      run(async () => ({ collection: columnsOf(await client.collections.get(collection)) })),
  );

  server.registerTool(
    "ohmycms_fields_list",
    {
      title: "フィールド一覧",
      description: "コレクションのフィールド（列）を返す。schema:read が必要。",
      inputSchema: S.FIELDS_LIST_INPUT,
      outputSchema: S.FIELDS_LIST_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ collection }) =>
      run(async () => {
        const rows = await client.fields.list(collection);
        return {
          fields: rows.map((row) => ({
            collection: row.collection,
            field: row.field,
            type: row.type,
            is_nullable: row.schema?.is_nullable ?? null,
            is_primary_key: row.schema?.is_primary_key ?? null,
          })),
          count: rows.length,
        };
      }),
  );

  /* ------------------------------------------------------------------ *
   * スキーマ（書き込み）— schema:write が要る
   * ------------------------------------------------------------------ */

  server.registerTool(
    "ohmycms_collection_create",
    {
      title: "コレクションを作る",
      description:
        "コレクション（テーブル）を作る。実行すると PostgreSQL に CREATE TABLE が走る。" +
        "トークンの capabilities に schema:write が無いと 403 CAPABILITY_DENIED になる。",
      inputSchema: S.COLLECTION_CREATE_INPUT,
      outputSchema: S.COLLECTION_CREATE_OUTPUT,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ collection, fields, note }) =>
      run(async () => {
        const created = await client.collections.create({
          collection,
          fields: [
            { field: "id", type: "uuid", schema: { is_primary_key: true } },
            ...(fields ?? []).map((field) => ({ field: field.field, type: field.type })),
          ],
          ...(note ? { meta: { note } } : {}),
        });
        return { collection: columnsOf(created) };
      }),
  );

  server.registerTool(
    "ohmycms_field_create",
    {
      title: "フィールドを追加する",
      description:
        "既存のコレクションに列を追加する（ALTER TABLE が走る）。schema:write が必要。",
      inputSchema: S.FIELD_CREATE_INPUT,
      outputSchema: S.FIELD_CREATE_OUTPUT,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ collection, field, type, required, max_length }) =>
      run(async () => {
        const created = await client.fields.create(collection, {
          field,
          type,
          schema: {
            ...(required === true ? { is_nullable: false } : {}),
            ...(max_length !== undefined ? { max_length } : {}),
          },
        });
        return {
          field: {
            collection: created.collection,
            field: created.field,
            type: created.type,
            is_nullable: created.schema?.is_nullable ?? null,
            is_primary_key: created.schema?.is_primary_key ?? null,
          },
        };
      }),
  );

  /* ------------------------------------------------------------------ *
   * items
   * ------------------------------------------------------------------ */

  server.registerTool(
    "ohmycms_items_query",
    {
      title: "アイテムを検索する",
      description:
        "コレクションの行を絞り込んで取る。権限（行・列）は API 側で強制されるので、" +
        "見えない行は最初から返らない。総件数が要るときは include_count を true にする。",
      inputSchema: S.ITEMS_QUERY_INPUT,
      outputSchema: S.ITEMS_QUERY_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ collection, filter, fields, sort, limit, offset, page, include_count }) =>
      run(async () => {
        const query: ItemsQuery = {
          ...(filter ? { filter: filter as FilterObject } : {}),
          ...(fields ? { fields } : {}),
          ...(sort ? { sort } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {}),
          ...(page !== undefined ? { page } : {}),
          ...(include_count ? { meta: ["total_count", "filter_count"] as const } : {}),
        };
        const result = await client.items.list(collection, query);
        return {
          data: result.data,
          ...(result.meta?.total_count !== undefined
            ? { total_count: result.meta.total_count }
            : {}),
          ...(result.meta?.filter_count !== undefined
            ? { filter_count: result.meta.filter_count }
            : {}),
        };
      }),
  );

  server.registerTool(
    "ohmycms_item_get",
    {
      title: "アイテムを1件取る",
      description:
        "主キーで 1 件取る。権限で見えない行は 404 ITEM_NOT_FOUND になる（存在しないのか見えないのかは区別されない）。",
      inputSchema: S.ITEM_GET_INPUT,
      outputSchema: S.ITEM_MUTATION_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ collection, id, fields }) =>
      run(async () => ({
        item: await client.items.get(collection, id, fields ? { fields } : undefined),
      })),
  );

  server.registerTool(
    "ohmycms_item_create",
    {
      title: "アイテムを登録する",
      description: "行を 1 件作る。create 権限が無いと 403 PERMISSION_DENIED。",
      inputSchema: S.ITEM_CREATE_INPUT,
      outputSchema: S.ITEM_MUTATION_OUTPUT,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ collection, data }) =>
      run(async () => ({ item: await client.items.create(collection, data) })),
  );

  server.registerTool(
    "ohmycms_item_update",
    {
      title: "アイテムを更新する",
      description:
        "行を 1 件更新する。渡した列だけが変わる。権限で見えない行は 404 になる。",
      inputSchema: S.ITEM_UPDATE_INPUT,
      outputSchema: S.ITEM_MUTATION_OUTPUT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ collection, id, data }) =>
      run(async () => ({ item: await client.items.update(collection, id, data) })),
  );

  /* ------------------------------------------------------------------ *
   * ファイル
   * ------------------------------------------------------------------ */

  server.registerTool(
    "ohmycms_files_list",
    {
      title: "ファイル一覧",
      description:
        "アップロード済みファイルの一覧。items と違い limit / offset だけで、絞り込みも総件数も無い。",
      inputSchema: S.FILES_LIST_INPUT,
      outputSchema: S.FILES_LIST_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ limit, offset, folder }) =>
      run(async () => {
        const rows = await client.files.list({
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {}),
          ...(folder !== undefined ? { folder } : {}),
        });
        return {
          files: rows.map((row) => ({
            id: row.id,
            filename_download: row.filename_download,
            type: row.type,
            title: row.title,
            filesize: row.filesize,
          })),
          count: rows.length,
        };
      }),
  );

  /* ------------------------------------------------------------------ *
   * 「今のトークンで何ができるか」
   * ------------------------------------------------------------------ */

  server.registerTool(
    "ohmycms_permissions_describe",
    {
      title: "いまのトークンで何ができるか",
      description:
        "接続に使っているトークンのアクター情報と、実際に API を叩いて確かめた可否を返す。" +
        "MCP 側の推測ではなく、API が返した結果をそのまま載せる。トークンの値は返さない。",
      inputSchema: S.EMPTY_INPUT,
      outputSchema: S.PERMISSIONS_DESCRIBE_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const actorRaw = await client.auth.me();
        const actor =
          actorRaw.type === "human"
            ? { type: "human", id: actorRaw.userId, email: actorRaw.email }
            : {
                type: "agent",
                id: actorRaw.agentId,
                name: actorRaw.name,
                on_behalf_of: actorRaw.onBehalfOf,
              };
        const capabilities =
          actorRaw.type === "agent"
            ? (actorRaw.capabilities as Record<string, unknown> | null)
            : null;

        // 実際に叩いて確かめる（MCP 側で判定しない）
        const probes: {
          what: string;
          allowed: boolean;
          code?: string;
          detail?: string;
        }[] = [];
        let readableCollections: string[] = [];

        const probe = async (what: string, fn: () => Promise<string | undefined>) => {
          try {
            const detail = await fn();
            probes.push({ what, allowed: true, ...(detail ? { detail } : {}) });
          } catch (error) {
            probes.push({
              what,
              allowed: false,
              code: isOhMyCmsError(error) ? error.code : "UNKNOWN",
              ...(isOhMyCmsError(error) ? { detail: error.message } : {}),
            });
          }
        };

        await probe("コレクション一覧の取得（schema:read）", async () => {
          const rows = await client.collections.list();
          readableCollections = rows.map((row) => row.collection);
          return `${rows.length} 件`;
        });
        await probe("ロール一覧の取得（settings:read）", async () => {
          const rows = await client.roles.list();
          return `${rows.length} 件`;
        });
        await probe("ポリシー一覧の取得（settings:read）", async () => {
          const rows = await client.policies.list();
          return `${rows.length} 件`;
        });
        await probe("ユーザー一覧の取得（settings:read）", async () => {
          const rows = await client.users.list();
          return `${rows.length} 件`;
        });
        await probe("ファイル一覧の取得", async () => {
          const rows = await client.files.list({ limit: 1 });
          return `${rows.length} 件`;
        });

        // 読めたコレクションについて、行が実際に取れるかも確かめる
        for (const name of readableCollections.slice(0, 20)) {
          await probe(`items の読み取り: ${name}`, async () => {
            const result = await client.items.list(name, { limit: 1 });
            return `${result.data.length} 件`;
          });
        }

        return { actor, capabilities, probes, readable_collections: readableCollections };
      }),
  );

  /* ------------------------------------------------------------------ *
   * 設定（管理トークンのときだけ成功する。判定は API 側）
   * ------------------------------------------------------------------ */

  server.registerTool(
    "ohmycms_roles_list",
    {
      title: "ロール一覧",
      description: "ロールの一覧。settings:read が必要。",
      inputSchema: S.EMPTY_INPUT,
      outputSchema: S.ROW_LIST_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const rows = await client.roles.list();
        return { rows, count: rows.length };
      }),
  );

  server.registerTool(
    "ohmycms_role_create",
    {
      title: "ロールを作る",
      description: "ロールを作る。settings:write が必要。",
      inputSchema: S.ROLE_CREATE_INPUT,
      outputSchema: S.ROW_OUTPUT,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ name, description, parent }) =>
      run(async () => ({
        row: await client.roles.create({
          name,
          ...(description !== undefined ? { description } : {}),
          ...(parent !== undefined ? { parent } : {}),
        }),
      })),
  );

  server.registerTool(
    "ohmycms_policies_list",
    {
      title: "ポリシー一覧",
      description: "ポリシー（権限のまとまり）の一覧。settings:read が必要。",
      inputSchema: S.EMPTY_INPUT,
      outputSchema: S.ROW_LIST_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const rows = await client.policies.list();
        return { rows, count: rows.length };
      }),
  );

  server.registerTool(
    "ohmycms_policy_create",
    {
      title: "ポリシーを作る",
      description:
        "ポリシーを作る。settings:write が必要。admin_access を true にすると全権限になるので慎重に。",
      inputSchema: S.POLICY_CREATE_INPUT,
      outputSchema: S.ROW_OUTPUT,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ name, description, app_access, admin_access }) =>
      run(async () => ({
        row: await client.policies.create({
          name,
          ...(description !== undefined ? { description } : {}),
          ...(app_access !== undefined ? { app_access } : {}),
          ...(admin_access !== undefined ? { admin_access } : {}),
        }),
      })),
  );

  server.registerTool(
    "ohmycms_permissions_list",
    {
      title: "権限の一覧",
      description:
        "ポリシーに紐づく権限（コレクション × アクション）の一覧。settings:read が必要。",
      inputSchema: S.PERMISSIONS_LIST_INPUT,
      outputSchema: S.ROW_LIST_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ policy }) =>
      run(async () => {
        const rows = await client.permissions.list(policy ? { policy } : {});
        return { rows, count: rows.length };
      }),
  );

  server.registerTool(
    "ohmycms_permission_create",
    {
      title: "権限を追加する",
      description:
        "ポリシーに「このコレクションのこのアクションを許す」を足す。settings:write が必要。",
      inputSchema: S.PERMISSION_CREATE_INPUT,
      outputSchema: S.ROW_OUTPUT,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ policy, collection, action, fields, permissions }) =>
      run(async () => ({
        row: await client.permissions.create({
          policy,
          collection,
          action,
          ...(fields !== undefined ? { fields } : {}),
          ...(permissions !== undefined ? { permissions } : {}),
        }),
      })),
  );

  server.registerTool(
    "ohmycms_access_create",
    {
      title: "ユーザー/ロールにポリシーを付ける",
      description:
        "ユーザーかロールにポリシーを結び付ける。settings:write が必要。user か role のどちらかを指定する。",
      inputSchema: S.ACCESS_CREATE_INPUT,
      outputSchema: S.ROW_OUTPUT,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ policy, user, role }) =>
      run(async () => ({
        row: await client.access.create({
          policy,
          ...(user !== undefined ? { user } : {}),
          ...(role !== undefined ? { role } : {}),
        }),
      })),
  );

  server.registerTool(
    "ohmycms_users_list",
    {
      title: "ユーザー一覧",
      description:
        "ユーザーの一覧。settings:read が必要。パスワードやトークンは返らない。",
      inputSchema: S.EMPTY_INPUT,
      outputSchema: S.ROW_LIST_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const rows = await client.users.list();
        return { rows, count: rows.length };
      }),
  );

  return server;
}
