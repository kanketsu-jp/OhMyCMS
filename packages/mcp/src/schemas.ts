import { z } from "zod";

/**
 * ツールの入出力スキーマ。
 * `registerTool` の inputSchema / outputSchema は **ZodRawShape（素のオブジェクト）**を取るので、
 * `z.object(...)` で包まずにそのまま渡す。
 */

const ITEM = z.record(z.unknown());

/* ---------------- 共通の出力 ---------------- */

export const ERROR_OUTPUT = {
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      status: z.number(),
      request: z.string().optional(),
    })
    .optional()
    .describe("API がエラーを返したときだけ入る"),
};

/* ---------------- health ---------------- */

export const HEALTH_OUTPUT = {
  status: z.string().optional(),
  db: z.string().optional(),
  url: z.string().optional().describe("接続先。トークンは含まない"),
  ...ERROR_OUTPUT,
};

/* ---------------- collections ---------------- */

const COLUMN = z.object({
  name: z.string(),
  data_type: z.string(),
  is_nullable: z.boolean(),
  is_primary_key: z.boolean(),
});

const COLLECTION = z.object({
  collection: z.string(),
  note: z.string().nullable().optional(),
  columns: z.array(COLUMN).optional(),
});

export const COLLECTIONS_LIST_INPUT = {
  include_system: z
    .boolean()
    .optional()
    .describe("directus_* のシステムテーブルも含めるか（既定 false）"),
};

export const COLLECTIONS_LIST_OUTPUT = {
  collections: z.array(COLLECTION).optional(),
  count: z.number().optional(),
  ...ERROR_OUTPUT,
};

export const COLLECTION_GET_INPUT = {
  collection: z.string().describe("コレクション名"),
};

export const COLLECTION_GET_OUTPUT = {
  collection: COLLECTION.optional(),
  ...ERROR_OUTPUT,
};

const FIELD_TYPE = z.enum([
  "string",
  "integer",
  "bigInteger",
  "decimal",
  "float",
  "boolean",
  "json",
  "uuid",
  "date",
  "time",
  "dateTime",
]);

export const COLLECTION_CREATE_INPUT = {
  collection: z
    .string()
    .describe("作るコレクション名。英数字とアンダースコアのみ"),
  fields: z
    .array(z.object({ field: z.string(), type: FIELD_TYPE }))
    .optional()
    .describe("追加するフィールド。主キー id (uuid) は自動で付く"),
  note: z.string().optional().describe("コレクションの説明"),
};

export const COLLECTION_CREATE_OUTPUT = {
  collection: COLLECTION.optional(),
  ...ERROR_OUTPUT,
};

/* ---------------- fields ---------------- */

const FIELD = z.object({
  collection: z.string(),
  field: z.string(),
  type: z.string(),
  is_nullable: z.boolean().nullable().optional(),
  is_primary_key: z.boolean().nullable().optional(),
});

export const FIELDS_LIST_INPUT = {
  collection: z.string().describe("コレクション名"),
};

export const FIELDS_LIST_OUTPUT = {
  fields: z.array(FIELD).optional(),
  count: z.number().optional(),
  ...ERROR_OUTPUT,
};

export const FIELD_CREATE_INPUT = {
  collection: z.string(),
  field: z.string().describe("追加するフィールド名"),
  type: FIELD_TYPE,
  required: z.boolean().optional().describe("NOT NULL にするか"),
  max_length: z.number().int().positive().optional().describe("string のときの長さ"),
};

export const FIELD_CREATE_OUTPUT = {
  field: FIELD.optional(),
  ...ERROR_OUTPUT,
};

/* ---------------- items ---------------- */

export const ITEMS_QUERY_INPUT = {
  collection: z.string().describe("コレクション名"),
  filter: z
    .record(z.unknown())
    .optional()
    .describe(
      '絞り込み。例 {"status":{"_eq":"published"}} / ' +
        "演算子: _eq _neq _lt _lte _gt _gte _in _nin _null _nnull _contains _icontains " +
        "_starts_with _ends_with _between _empty / 論理: _and _or",
    ),
  fields: z
    .array(z.string())
    .optional()
    .describe('取り出す列。ドットでリレーション先（例 ["title","author.name"]）'),
  sort: z
    .array(z.string())
    .optional()
    .describe('並び順。先頭 - で降順（例 ["-views"]）。実列のみ'),
  limit: z.number().int().optional().describe("既定 100 / 最大 1000"),
  offset: z.number().int().nonnegative().optional(),
  page: z.number().int().positive().optional().describe("1 始まり。offset を上書きする"),
  include_count: z
    .boolean()
    .optional()
    .describe("総件数も取るか。指定しないと件数は返らない"),
};

export const ITEMS_QUERY_OUTPUT = {
  data: z.array(ITEM).optional(),
  total_count: z.number().optional().describe("フィルタなしの件数"),
  filter_count: z.number().optional().describe("フィルタ後の件数"),
  ...ERROR_OUTPUT,
};

export const ITEM_GET_INPUT = {
  collection: z.string(),
  id: z.string(),
  fields: z.array(z.string()).optional(),
};

export const ITEM_MUTATION_OUTPUT = {
  item: ITEM.optional(),
  ...ERROR_OUTPUT,
};

export const ITEM_CREATE_INPUT = {
  collection: z.string(),
  data: z.record(z.unknown()).describe("登録する内容。列名をキーにする"),
};

export const ITEM_UPDATE_INPUT = {
  collection: z.string(),
  id: z.string(),
  data: z.record(z.unknown()).describe("更新する列だけを入れる"),
};

/* ---------------- files ---------------- */

export const FILES_LIST_INPUT = {
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  folder: z.string().optional().describe("フォルダ ID で絞る"),
};

export const FILES_LIST_OUTPUT = {
  files: z
    .array(
      z.object({
        id: z.string(),
        filename_download: z.string(),
        type: z.string().nullable(),
        title: z.string().nullable(),
        filesize: z.union([z.string(), z.number()]).nullable(),
      }),
    )
    .optional(),
  count: z.number().optional(),
  ...ERROR_OUTPUT,
};

/* ---------------- 権限の自己申告 ---------------- */

export const PERMISSIONS_DESCRIBE_OUTPUT = {
  actor: z
    .object({
      type: z.string(),
      id: z.string().optional(),
      name: z.string().optional(),
      email: z.string().optional(),
      on_behalf_of: z.string().optional(),
    })
    .optional()
    .describe("API が返したアクター。トークンの値は含まない"),
  capabilities: z
    .record(z.unknown())
    .nullable()
    .optional()
    .describe("トークンに設定された capabilities（null なら未指定）"),
  probes: z
    .array(
      z.object({
        what: z.string().describe("何を試したか"),
        allowed: z.boolean(),
        code: z.string().optional().describe("拒否されたときの API のエラーコード"),
        detail: z.string().optional(),
      }),
    )
    .optional()
    .describe("実際に API を叩いて確かめた結果。MCP 側の判断ではない"),
  readable_collections: z
    .array(z.string())
    .optional()
    .describe("実際に一覧が取れたコレクション"),
  ...ERROR_OUTPUT,
};

/* ---------------- 設定系（管理トークンのときだけ成功する） ---------------- */

export const EMPTY_INPUT = {};

export const ROW_LIST_OUTPUT = {
  rows: z.array(z.record(z.unknown())).optional(),
  count: z.number().optional(),
  ...ERROR_OUTPUT,
};

export const ROW_OUTPUT = {
  row: z.record(z.unknown()).optional(),
  ...ERROR_OUTPUT,
};

export const SETTINGS_OUTPUT = {
  settings: z.record(z.unknown()).optional().describe("設定。秘密項目は値ではなく *_set の真偽だけを含む"),
  ...ERROR_OUTPUT,
};

export const SETTINGS_UPDATE_INPUT = {
  patch: z
    .record(z.unknown())
    .describe(
      "更新する設定キーと値。空文字または null で DB の値を解除する。" +
        "秘密項目は保存されるが、レスポンスには値が返らない",
    ),
};

export const ROLE_CREATE_INPUT = {
  name: z.string(),
  description: z.string().optional(),
  parent: z.string().optional().describe("親ロールの ID"),
};

export const POLICY_CREATE_INPUT = {
  name: z.string(),
  description: z.string().optional(),
  app_access: z.boolean().optional(),
  admin_access: z.boolean().optional().describe("true にすると全権限になる"),
};

export const PERMISSION_CREATE_INPUT = {
  policy: z.string().describe("ポリシーの ID"),
  collection: z.string(),
  action: z.enum(["read", "create", "update", "delete"]),
  fields: z
    .string()
    .optional()
    .describe('許可する列。カンマ区切り。"*" で全列'),
  permissions: z
    .record(z.unknown())
    .optional()
    .describe("行フィルタ。items の filter と同じ記法"),
};

export const PERMISSIONS_LIST_INPUT = {
  policy: z.string().optional().describe("ポリシー ID で絞る"),
};

export const ACCESS_CREATE_INPUT = {
  policy: z.string().describe("結び付けるポリシーの ID"),
  user: z.string().optional().describe("ユーザー ID（user か role のどちらか）"),
  role: z.string().optional().describe("ロール ID"),
};
