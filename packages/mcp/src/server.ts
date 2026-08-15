import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  isOhMyCmsError,
  type FilterObject,
  type ItemsQuery,
  type OhMyCmsClient,
} from "@ohmycms/sdk";
import { TOOL_CATALOG } from "./catalog.js";
import { run } from "./result.js";

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
    TOOL_CATALOG.ohmycms_health,
    async () =>
      run(async () => ({ ...(await client.health()), url: client.baseUrl })),
  );

  /* ------------------------------------------------------------------ *
   * スキーマ（読み取り）
   * ------------------------------------------------------------------ */

  server.registerTool(
    "ohmycms_collections_list",
    TOOL_CATALOG.ohmycms_collections_list,
    async ({ include_system }) =>
      run(async () => {
        const rows = await client.collections.list({ system: include_system === true });
        return { collections: rows.map(columnsOf), count: rows.length };
      }),
  );

  server.registerTool(
    "ohmycms_collection_get",
    TOOL_CATALOG.ohmycms_collection_get,
    async ({ collection }) =>
      run(async () => ({ collection: columnsOf(await client.collections.get(collection)) })),
  );

  server.registerTool(
    "ohmycms_fields_list",
    TOOL_CATALOG.ohmycms_fields_list,
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
    TOOL_CATALOG.ohmycms_collection_create,
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
    TOOL_CATALOG.ohmycms_field_create,
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
    TOOL_CATALOG.ohmycms_items_query,
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
    TOOL_CATALOG.ohmycms_item_get,
    async ({ collection, id, fields }) =>
      run(async () => ({
        item: await client.items.get(collection, id, fields ? { fields } : undefined),
      })),
  );

  server.registerTool(
    "ohmycms_item_create",
    TOOL_CATALOG.ohmycms_item_create,
    async ({ collection, data }) =>
      run(async () => ({ item: await client.items.create(collection, data) })),
  );

  server.registerTool(
    "ohmycms_item_update",
    TOOL_CATALOG.ohmycms_item_update,
    async ({ collection, id, data }) =>
      run(async () => ({ item: await client.items.update(collection, id, data) })),
  );

  /* ------------------------------------------------------------------ *
   * ファイル
   * ------------------------------------------------------------------ */

  server.registerTool(
    "ohmycms_files_list",
    TOOL_CATALOG.ohmycms_files_list,
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
    TOOL_CATALOG.ohmycms_permissions_describe,
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
    TOOL_CATALOG.ohmycms_roles_list,
    async () =>
      run(async () => {
        const rows = await client.roles.list();
        return { rows, count: rows.length };
      }),
  );

  server.registerTool(
    "ohmycms_role_create",
    TOOL_CATALOG.ohmycms_role_create,
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
    TOOL_CATALOG.ohmycms_policies_list,
    async () =>
      run(async () => {
        const rows = await client.policies.list();
        return { rows, count: rows.length };
      }),
  );

  server.registerTool(
    "ohmycms_policy_create",
    TOOL_CATALOG.ohmycms_policy_create,
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
    TOOL_CATALOG.ohmycms_permissions_list,
    async ({ policy }) =>
      run(async () => {
        const rows = await client.permissions.list(policy ? { policy } : {});
        return { rows, count: rows.length };
      }),
  );

  server.registerTool(
    "ohmycms_permission_create",
    TOOL_CATALOG.ohmycms_permission_create,
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
    TOOL_CATALOG.ohmycms_access_create,
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
    TOOL_CATALOG.ohmycms_users_list,
    async () =>
      run(async () => {
        const rows = await client.users.list();
        return { rows, count: rows.length };
      }),
  );

  server.registerTool(
    "ohmycms_settings_get",
    TOOL_CATALOG.ohmycms_settings_get,
    async () =>
      run(async () => ({
        settings: await client.settings.get(),
      })),
  );

  server.registerTool(
    "ohmycms_settings_update",
    TOOL_CATALOG.ohmycms_settings_update,
    async ({ patch }) =>
      run(async () => ({
        settings: await client.settings.update(patch),
      })),
  );

  return server;
}
