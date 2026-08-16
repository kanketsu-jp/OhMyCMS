import * as S from "./schemas.js";

/** 1 本のツールの「説明」。実行の中身（ハンドラ）はここには置かない。 */
export type ToolSpec = {
  title: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  annotations: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

/** ツール名 → 説明。**これが唯一の正**。server.ts も /api/mcp/tools もここを読む。 */
export const TOOL_CATALOG = {
  ohmycms_health: {
    title: "疎通確認",
    description: "OhMyCMS の API に繋がるか、DB まで到達できているかを確認する。認証は不要。",
    inputSchema: S.EMPTY_INPUT,
    outputSchema: S.HEALTH_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_collections_list: {
    title: "コレクション一覧",
    description:
      "コレクション（テーブル）の一覧と各列を返す。管理系の権限が要る（トークンの capabilities に schema:read が必要）。",
    inputSchema: S.COLLECTIONS_LIST_INPUT,
    outputSchema: S.COLLECTIONS_LIST_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_collection_get: {
    title: "コレクションを1つ取る",
    description: "指定したコレクションの定義（列・メモ）を返す。schema:read が必要。",
    inputSchema: S.COLLECTION_GET_INPUT,
    outputSchema: S.COLLECTION_GET_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_fields_list: {
    title: "フィールド一覧",
    description: "コレクションのフィールド（列）を返す。schema:read が必要。",
    inputSchema: S.FIELDS_LIST_INPUT,
    outputSchema: S.FIELDS_LIST_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_collection_create: {
    title: "コレクションを作る",
    description:
      "コレクション（テーブル）を作る。実行すると PostgreSQL に CREATE TABLE が走る。" +
      "トークンの capabilities に schema:write が無いと 403 CAPABILITY_DENIED になる。",
    inputSchema: S.COLLECTION_CREATE_INPUT,
    outputSchema: S.COLLECTION_CREATE_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  ohmycms_field_create: {
    title: "フィールドを追加する",
    description:
      "既存のコレクションに列を追加する（ALTER TABLE が走る）。schema:write が必要。",
    inputSchema: S.FIELD_CREATE_INPUT,
    outputSchema: S.FIELD_CREATE_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  ohmycms_items_query: {
    title: "アイテムを検索する",
    description:
      "コレクションの行を絞り込んで取る。権限（行・列）は API 側で強制されるので、" +
      "見えない行は最初から返らない。総件数が要るときは include_count を true にする。",
    inputSchema: S.ITEMS_QUERY_INPUT,
    outputSchema: S.ITEMS_QUERY_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_item_get: {
    title: "アイテムを1件取る",
    description:
      "主キーで 1 件取る。権限で見えない行は 404 ITEM_NOT_FOUND になる（存在しないのか見えないのかは区別されない）。",
    inputSchema: S.ITEM_GET_INPUT,
    outputSchema: S.ITEM_MUTATION_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_item_create: {
    title: "アイテムを登録する",
    description: "行を 1 件作る。create 権限が無いと 403 PERMISSION_DENIED。",
    inputSchema: S.ITEM_CREATE_INPUT,
    outputSchema: S.ITEM_MUTATION_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  ohmycms_item_update: {
    title: "アイテムを更新する",
    description:
      "行を 1 件更新する。渡した列だけが変わる。権限で見えない行は 404 になる。",
    inputSchema: S.ITEM_UPDATE_INPUT,
    outputSchema: S.ITEM_MUTATION_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  ohmycms_files_list: {
    title: "ファイル一覧",
    description:
      "アップロード済みファイルの一覧。items と違い limit / offset だけで、絞り込みも総件数も無い。",
    inputSchema: S.FILES_LIST_INPUT,
    outputSchema: S.FILES_LIST_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_permissions_describe: {
    title: "いまのトークンで何ができるか",
    description:
      "接続に使っているトークンのアクター情報と、実際に API を叩いて確かめた可否を返す。" +
      "MCP 側の推測ではなく、API が返した結果をそのまま載せる。トークンの値は返さない。",
    inputSchema: S.EMPTY_INPUT,
    outputSchema: S.PERMISSIONS_DESCRIBE_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_roles_list: {
    title: "ロール一覧",
    description: "ロールの一覧。settings:read が必要。",
    inputSchema: S.EMPTY_INPUT,
    outputSchema: S.ROW_LIST_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_role_create: {
    title: "ロールを作る",
    description: "ロールを作る。settings:write が必要。",
    inputSchema: S.ROLE_CREATE_INPUT,
    outputSchema: S.ROW_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  ohmycms_policies_list: {
    title: "ポリシー一覧",
    description: "ポリシー（権限のまとまり）の一覧。settings:read が必要。",
    inputSchema: S.EMPTY_INPUT,
    outputSchema: S.ROW_LIST_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_policy_create: {
    title: "ポリシーを作る",
    description:
      "ポリシーを作る。settings:write が必要。admin_access を true にすると全権限になるので慎重に。",
    inputSchema: S.POLICY_CREATE_INPUT,
    outputSchema: S.ROW_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  ohmycms_permissions_list: {
    title: "権限の一覧",
    description:
      "ポリシーに紐づく権限（コレクション × アクション）の一覧。settings:read が必要。",
    inputSchema: S.PERMISSIONS_LIST_INPUT,
    outputSchema: S.ROW_LIST_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_permission_create: {
    title: "権限を追加する",
    description:
      "ポリシーに「このコレクションのこのアクションを許す」を足す。settings:write が必要。",
    inputSchema: S.PERMISSION_CREATE_INPUT,
    outputSchema: S.ROW_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  ohmycms_access_create: {
    title: "ユーザー/ロールにポリシーを付ける",
    description:
      "ユーザーかロールにポリシーを結び付ける。settings:write が必要。user か role のどちらかを指定する。",
    inputSchema: S.ACCESS_CREATE_INPUT,
    outputSchema: S.ROW_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  ohmycms_users_list: {
    title: "ユーザー一覧",
    description:
      "ユーザーの一覧。settings:read が必要。パスワードやトークンは返らない。",
    inputSchema: S.EMPTY_INPUT,
    outputSchema: S.ROW_LIST_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_settings_get: {
    title: "設定を取得する",
    description:
      "全体設定を返す。settings:read が必要。秘密項目（アクセスキー等）は値を返さず、設定済みかどうかのみ返す。",
    inputSchema: S.EMPTY_INPUT,
    outputSchema: S.SETTINGS_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ohmycms_settings_update: {
    title: "設定を更新する",
    description:
      "全体設定を更新する。settings:write が必要。秘密項目（アクセスキー等）は保存できるが、レスポンスには値を返さない。",
    inputSchema: S.SETTINGS_UPDATE_INPUT,
    outputSchema: S.SETTINGS_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  ohmycms_shortcuts_list: {
    title: "ショートカット一覧",
    description:
      "画面のキーボードショートカットを返す。認証は不要（画面の作りを説明するだけで、データには触れない）。scope は使われている場所から導出したもので、導出できないものは unknown（global に倒していない）。",
    inputSchema: S.EMPTY_INPUT,
    outputSchema: S.SHORTCUTS_LIST_OUTPUT,
    // 🚨 押させない。読むだけ。外にも出ない（写しを返すので openWorldHint は付けない）。
    annotations: { readOnlyHint: true },
  },
} as const satisfies Record<string, ToolSpec>;

export type ToolName = keyof typeof TOOL_CATALOG;
