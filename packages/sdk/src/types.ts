/**
 * apps/studio 側の実装を読んで写した型。
 * 出典は各型のコメントに書いてある（推測で足していない。分からない形は unknown）。
 */

/* ------------------------------------------------------------------ *
 * 認証・アクター（lib/auth/context.ts）
 * ------------------------------------------------------------------ */

/** Cookie セッションで認証したときのアクター */
export type HumanActor = {
  type: "human";
  userId: string;
  email: string;
  role: string | null;
};

/** Authorization: Bearer で認証したときのアクター */
export type AgentActor = {
  type: "agent";
  agentId: string;
  name: string;
  onBehalfOf: string;
  tenantScope: unknown;
  capabilities: unknown;
};

export type Actor = HumanActor | AgentActor;

/** GET /api/health のレスポンス（`ok` 以外は 500 で status:"error"） */
export type HealthResult = {
  status: "ok";
  db: "connected";
};

/* ------------------------------------------------------------------ *
 * エージェントトークン（app/api/auth/agents/route.ts）
 * ------------------------------------------------------------------ */

export type Agent = {
  id: string;
  name: string;
  /** 委任元ユーザーの id。権限はこのユーザーのポリシーから決まる */
  on_behalf_of: string;
  tenant_scope: unknown;
  capabilities: unknown;
  origin: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type CreateAgentInput = {
  name: string;
  /** 1〜365 の整数。範囲外は 400 INVALID_AGENT_EXPIRATION */
  expires_in_days: number;
  origin?: string;
  /** 行レベルの絞り込み。items のフィルタと同じ記法 */
  tenant_scope?: FilterObject | null;
  /** `{ collections: { "<name>": ["read","create"] } }`。null なら無制限 */
  capabilities?: AgentCapabilities | null;
};

/**
 * 管理系ルート（collections / fields / relations / roles / policies / permissions / access / users）
 * を触るために必要な capability。
 * 出典: apps/studio/lib/permissions/resolve.ts の AdminCapability
 */
export type AdminCapability =
  | "schema:read"
  | "schema:write"
  | "settings:read"
  | "settings:write";

/** すべての管理 capability。管理者トークンを作るときの既定に使う */
export const ALL_ADMIN_CAPABILITIES: readonly AdminCapability[] = [
  "schema:read",
  "schema:write",
  "settings:read",
  "settings:write",
];

/**
 * エージェントトークンに与える権限。**委任元ユーザーの権限との積**になる
 * （capabilities を広げても、委任元が持っていない権限は得られない）。
 *
 * 🚨 **`collections` と `admin` で既定が逆**（apps/studio/lib/permissions/resolve.ts のコメント）:
 * - `collections`: 未指定（null）→ **委任元の権限をそのまま継承する**
 * - `admin`:       未指定（null）→ **管理操作はすべて拒否される**（403 CAPABILITY_DENIED）
 *
 * つまり「管理もできるトークン」を作るには `admin` を明示的に渡す必要がある。
 */
export type AgentCapabilities = {
  collections?: Record<string, PermissionAction[]>;
  admin?: AdminCapability[];
};

/** 平文トークンはこの戻り値でしか手に入らない（DB には sha256 しか残らない） */
export type CreateAgentResult = {
  agent: Agent;
  token: string;
};

/* ------------------------------------------------------------------ *
 * スキーマ（lib/schema/models.ts）
 * ------------------------------------------------------------------ */

export type ColumnInfo = {
  name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  max_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_primary_key: boolean;
  foreign_key_table: string | null;
  foreign_key_column: string | null;
};

export type CollectionMeta = {
  collection: string;
  note: string | null;
  display_template: string | null;
  hidden: boolean;
  singleton: boolean;
  archive_field: string | null;
  archive_app_filter: boolean;
  archive_value: string | null;
  unarchive_value: string | null;
  sort_field: string | null;
  accountability: string | null;
  item_duplication_fields: unknown | null;
  group: string | null;
  collapse: string;
  status: string;
  autosave_revision_interval: number | null;
};

export type Collection = {
  collection: string;
  meta: CollectionMeta | null;
  schema: {
    name: string;
    columns: ColumnInfo[];
  } | null;
};

export type FieldMeta = {
  id: number;
  collection: string;
  field: string;
  special: string | null;
  interface: string | null;
  options: unknown | null;
  display: string | null;
  display_options: unknown | null;
  locked: boolean;
  readonly: boolean;
  hidden: boolean;
  required: boolean;
  sort: number | null;
  width: string;
  group: number | null;
  note: string | null;
  conditions: unknown | null;
  validation: unknown | null;
  validation_message: string | null;
};

export type Field = {
  collection: string;
  field: string;
  type: string;
  meta: FieldMeta | null;
  schema: ColumnInfo | null;
};

export type RelationMeta = {
  id: number;
  many_collection: string;
  many_field: string;
  many_primary: string;
  one_collection: string | null;
  one_field: string | null;
  one_primary: string | null;
  one_collection_field: string | null;
  one_allowed_collections: string | null;
  junction_field: string | null;
};

export type Relation = {
  many_collection: string;
  many_field: string;
  meta: RelationMeta | null;
  schema: {
    foreign_key_table: string | null;
    foreign_key_column: string | null;
  } | null;
};

/** lib/schema/types.ts の FIELD_TYPE_TO_SQL のキー。これ以外は 400 INVALID_FIELD_TYPE */
export type FieldType =
  | "string"
  | "integer"
  | "bigInteger"
  | "decimal"
  | "float"
  | "boolean"
  | "json"
  | "uuid"
  | "date"
  | "time"
  | "dateTime";

export type FieldSchemaSpec = {
  is_nullable?: boolean;
  is_primary_key?: boolean;
  default?: unknown;
  column_default?: unknown;
  max_length?: number;
  numeric_precision?: number;
  numeric_scale?: number;
};

export type FieldSpec = {
  field: string;
  type: FieldType;
  schema?: FieldSchemaSpec;
  meta?: Record<string, unknown>;
};

export type CreateCollectionInput = {
  collection: string;
  fields?: FieldSpec[];
  meta?: Record<string, unknown>;
  schema?: Record<string, unknown>;
};

/* ------------------------------------------------------------------ *
 * items（lib/items/）
 * ------------------------------------------------------------------ */

export type Item = Record<string, unknown>;

/** lib/items/filter.ts の OPERATORS と 1:1 */
export type FilterOperators = {
  _eq?: unknown;
  _neq?: unknown;
  _lt?: unknown;
  _lte?: unknown;
  _gt?: unknown;
  _gte?: unknown;
  _in?: readonly unknown[] | string;
  _nin?: readonly unknown[] | string;
  _null?: boolean;
  _nnull?: boolean;
  _contains?: string;
  _ncontains?: string;
  _icontains?: string;
  _starts_with?: string;
  _ends_with?: string;
  _between?: readonly [unknown, unknown];
  _nbetween?: readonly [unknown, unknown];
  _empty?: boolean;
  _nempty?: boolean;
};

/**
 * filter の値。
 * - `{ status: { _eq: "published" } }` … 列に演算子
 * - `{ status: "published" }`           … 演算子を省くと _eq
 * - `{ author: { name: { _eq: "x" } } }` … リレーション先の絞り込み
 * - `{ _and: [...] }` / `{ _or: [...] }` … 論理演算
 */
export type FilterObject = {
  _and?: FilterObject[];
  _or?: FilterObject[];
} & {
  [field: string]: FilterOperators | FilterObject | unknown;
};

export type MetaField = "total_count" | "filter_count";

export type ItemsQuery = {
  /** `["title","author.name"]` → `fields=title,author.name`。末尾に `*` を置ける */
  fields?: string | readonly string[];
  filter?: FilterObject;
  /** `["-views","title"]` → 先頭 `-` で降順。実列のみ（ドット不可） */
  sort?: string | readonly string[];
  /** 既定 100 / 最大 1000 / -1 は 10000 で頭打ち */
  limit?: number;
  offset?: number;
  /** 1 始まり。指定すると offset は (page-1)*limit で上書きされる */
  page?: number;
  /** 指定しないと meta は返らない */
  meta?: MetaField | readonly MetaField[];
  /** リレーション先の絞り込み。`{ comments: { _limit: 5, _sort: "-created_at" } }` */
  deep?: Record<string, unknown>;
};

export type ItemsListResult<T extends Item = Item> = {
  data: T[];
  meta?: {
    total_count?: number;
    filter_count?: number;
  };
};

/* ------------------------------------------------------------------ *
 * 権限（lib/admin/permissions-api.ts, lib/permissions/resolve.ts）
 * ------------------------------------------------------------------ */

export type PermissionAction = "read" | "create" | "update" | "delete";

export type Role = {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  parent: string | null;
  [key: string]: unknown;
};

export type Policy = {
  id: string;
  name: string;
  description: string | null;
  ip_access: string | null;
  app_access: boolean;
  admin_access: boolean;
  enforce_tfa: boolean;
  [key: string]: unknown;
};

export type Permission = {
  id: number;
  policy: string;
  collection: string;
  action: PermissionAction;
  /** 行フィルタ。null なら行の制限なし */
  permissions: FilterObject | null;
  /** カンマ区切り。`*` で全列 */
  fields: string | null;
  validation: unknown | null;
  presets: unknown | null;
  [key: string]: unknown;
};

/** ユーザー or ロールにポリシーを結び付ける行 */
export type Access = {
  id: string;
  user: string | null;
  role: string | null;
  policy: string;
  sort: number | null;
  [key: string]: unknown;
};

export type User = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  status: string;
  role: string | null;
  last_access: string | null;
  provider: string;
  external_identifier: string | null;
};

/* ------------------------------------------------------------------ *
 * ファイル（lib/files/service.ts）
 * ------------------------------------------------------------------ */

export type FileRecord = {
  id: string;
  storage: string;
  filename_disk: string;
  filename_download: string;
  title: string | null;
  type: string | null;
  folder: string | null;
  uploaded_by: string | null;
  uploaded_on: string;
  filesize: string | number | null;
  width: number | null;
  height: number | null;
  description: string | null;
  tags: unknown | null;
  [key: string]: unknown;
};

export type Folder = {
  id: string;
  name: string;
  parent: string | null;
  [key: string]: unknown;
};

export type UploadInput = {
  /** ファイル本体。Node なら Buffer/Uint8Array、ブラウザなら File/Blob */
  body: Uint8Array | Blob;
  filename: string;
  contentType?: string;
  title?: string | null;
  description?: string | null;
  tags?: string | null;
  folder?: string | null;
};

export type AssetTransform = {
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "inside" | "outside" | "fill";
  format?: string;
  quality?: number;
};

export type AssetResult = {
  body: Uint8Array;
  contentType: string;
  contentLength: number;
  /**
   * SVG/HTML は `attachment` が強制される（AGENTS.md §3.4）。
   * 呼び出し側でこの値を握りつぶさないこと。
   */
  contentDisposition: string | null;
};

/* ------------------------------------------------------------------ *
 * 一覧のクエリ（files / folders は limit / offset のみ。meta は無い）
 * ------------------------------------------------------------------ */

export type FileListQuery = {
  limit?: number;
  offset?: number;
  folder?: string;
};

export type FolderListQuery = {
  limit?: number;
  offset?: number;
};
