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
  /**
   * 欄名の辞書（設問286 A）。`{"ja": "本文", "en": "Body"}` のロケール辞書。
   * 🚨 **null が既定**。null のときは**生の識別子（`field`）をそのまま出す**——
   * 「まだ名前を付けていない」と「空文字の名前を付けた」を区別するため。
   * 読むときは必ず `fieldLabel()` を通すこと（各所で `?? field.field` を書くと必ず割れる）。
   */
  translations: Record<string, string> | null;
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

export type CollectionResult = {
  collection: string;
  meta: CollectionMeta | null;
  schema: {
    name: string;
    columns: ColumnInfo[];
  } | null;
};

export type FieldResult = {
  collection: string;
  field: string;
  type: string;
  meta: FieldMeta | null;
  schema: ColumnInfo | null;
};

export type RelationResult = {
  many_collection: string;
  many_field: string;
  meta: RelationMeta | null;
  schema: {
    foreign_key_table: string | null;
    foreign_key_column: string | null;
  } | null;
};

export type FieldSchemaSpec = {
  is_nullable?: boolean;
  is_primary_key?: boolean;
  /**
   * 整数の主キーを自動採番にする。
   * 🚨 以前はこの項目自体が存在せず、API から渡しても**黙って捨てられて**いた。
   * 結果、id に既定値の無い列ができ、id を省いた作成が 500 になっていた。
   */
  has_auto_increment?: boolean;
  default?: unknown;
  column_default?: unknown;
  max_length?: number;
  numeric_precision?: number;
  numeric_scale?: number;
};

export type FieldSchemaPatch = {
  is_nullable?: boolean;
  default?: unknown;
  column_default?: unknown;
};

export type FieldSpec = {
  field: string;
  type: string;
  schema?: FieldSchemaSpec;
  meta?: Record<string, unknown>;
};

