import { db } from "@/lib/db/knex";
import type { Knex } from "knex";
import { ApiError, rethrowAsConflict } from "./errors";
import { getColumns, getSchemaOverview, getTables } from "./introspect";
import type {
  CollectionMeta,
  CollectionResult,
  ColumnInfo,
  FieldMeta,
  FieldResult,
  FieldSchemaPatch,
  FieldSchemaSpec,
  FieldSpec,
  RelationMeta,
  RelationResult,
} from "./models";
import { deriveFieldType, sqlTypeForField } from "./types";
import { plainColumnName } from "@/lib/richtext/document";
import { assertSafeIdentifier, isSystemTableName } from "./validate";

const COLLECTION_META_COLUMNS = new Set([
  "note",
  "display_template",
  "hidden",
  "singleton",
  "archive_field",
  "archive_app_filter",
  "archive_value",
  "unarchive_value",
  "sort_field",
  "accountability",
  "item_duplication_fields",
  "group",
  "collapse",
  "status",
  "autosave_revision_interval",
]);

const FIELD_META_COLUMNS = new Set([
  "special",
  "interface",
  "options",
  "display",
  "display_options",
  "locked",
  "readonly",
  "hidden",
  "required",
  "sort",
  "width",
  "group",
  "note",
  "conditions",
  "validation",
  "validation_message",
]);

const RELATION_META_COLUMNS = new Set([
  "many_collection",
  "many_field",
  "many_primary",
  "one_collection",
  "one_field",
  "one_primary",
  "one_collection_field",
  "one_allowed_collections",
  "junction_field",
]);

const FIELD_SCHEMA_PATCH_COLUMNS = new Set(["is_nullable", "default", "column_default"]);

function pickAllowed(
  input: unknown,
  allowed: Set<string>,
  code: string,
): Record<string, unknown> {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "INVALID_META", "metaはオブジェクトで指定してください");
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) {
      throw new ApiError(400, code, `未対応のmeta項目です: ${key}`);
    }
    result[key] = value;
  }
  return result;
}

function parseFieldSchema(input: unknown): FieldSchemaSpec | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "INVALID_SCHEMA", "schemaはオブジェクトで指定してください");
  }

  const schema = input as FieldSchemaSpec;
  if (schema.max_length !== undefined && !Number.isInteger(schema.max_length)) {
    throw new ApiError(400, "INVALID_SCHEMA", "max_lengthは整数で指定してください");
  }
  if (
    schema.numeric_precision !== undefined &&
    !Number.isInteger(schema.numeric_precision)
  ) {
    throw new ApiError(400, "INVALID_SCHEMA", "numeric_precisionは整数で指定してください");
  }
  if (schema.numeric_scale !== undefined && !Number.isInteger(schema.numeric_scale)) {
    throw new ApiError(400, "INVALID_SCHEMA", "numeric_scaleは整数で指定してください");
  }

  return schema;
}

function parseFieldSchemaPatch(input: unknown): FieldSchemaPatch | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "INVALID_SCHEMA", "schemaはオブジェクトで指定してください");
  }

  for (const key of Object.keys(input)) {
    if (!FIELD_SCHEMA_PATCH_COLUMNS.has(key)) {
      throw new ApiError(
        400,
        "UNSUPPORTED_SCHEMA_PATCH",
        `MVPで変更できるschema項目はnullable/defaultのみです: ${key}`,
      );
    }
  }

  return input as FieldSchemaPatch;
}

function parseFields(input: unknown): FieldSpec[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    throw new ApiError(400, "INVALID_FIELDS", "fieldsは配列で指定してください");
  }

  return input.map((fieldSpec) => {
    if (!fieldSpec || typeof fieldSpec !== "object" || Array.isArray(fieldSpec)) {
      throw new ApiError(400, "INVALID_FIELD", "field定義はオブジェクトで指定してください");
    }

    const spec = fieldSpec as Record<string, unknown>;
    if (typeof spec.field !== "string" || typeof spec.type !== "string") {
      throw new ApiError(400, "INVALID_FIELD", "fieldとtypeは文字列で指定してください");
    }

    return {
      field: spec.field,
      type: spec.type,
      schema: parseFieldSchema(spec.schema),
      meta: pickAllowed(spec.meta, FIELD_META_COLUMNS, "UNSUPPORTED_FIELD_META"),
    };
  });
}

function defaultValueFromSchema(
  schema: FieldSchemaSpec | FieldSchemaPatch | undefined,
): Knex.RawBinding | undefined {
  if (!schema) return undefined;
  const value = Object.hasOwn(schema, "default")
    ? schema.default
    : Object.hasOwn(schema, "column_default")
      ? schema.column_default
      : undefined;

  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  throw new ApiError(
    400,
    "INVALID_DEFAULT",
    "defaultは文字列・数値・真偽値・nullで指定してください",
  );
}

/**
 * 主キーに**値を作る仕組み**を与える。
 *
 * 🚨 これが無いと「作れるのに1行も入らない」コレクションができる。
 * 主キーは NOT NULL なので、既定値が無ければ **id を省いた INSERT が必ず落ちる**（汎用の 500）。
 * GUI からコレクションを作ると既定の `id uuid PRIMARY KEY` になるため、
 * **GUI で作った人は1件もアイテムを作れなかった**（受入基準3 の核心）。
 *
 * 🚨 アプリ側で uuid を作って INSERT に載せるのではなく、**DB の既定値**にしている。
 * そうしないと CLI / MCP / 直接 SQL など**入口ごとに同じことを書く**ことになり、
 * どれか1つを直し忘れる。`gen_random_uuid()` は PostgreSQL 13 以降の組み込みで、拡張は要らない。
 */
function primaryKeyDefault(type: string, schema: FieldSchemaSpec | undefined): string | null {
  if (!schema?.is_primary_key) return null;
  // 利用者が明示した既定値があるなら、そちらを優先する（addDefaultClause が付ける）
  if (defaultValueFromSchema(schema) !== undefined) return null;
  if (schema.has_auto_increment) {
    // 整数の自動採番。serial（暗黙のシーケンス）より identity のほうが標準で、権限も素直
    return "GENERATED BY DEFAULT AS IDENTITY";
  }
  if (type === "uuid") return "DEFAULT gen_random_uuid()";
  return null;
}

function columnDefinition(type: string, schema: FieldSchemaSpec | undefined): string {
  const parts = [sqlTypeForField(type, schema)];
  if (schema?.is_primary_key) parts.push("PRIMARY KEY");
  if (schema?.is_nullable === false || schema?.is_primary_key) parts.push("NOT NULL");
  const generated = primaryKeyDefault(type, schema);
  if (generated) parts.push(generated);
  return parts.join(" ");
}

function addDefaultClause(
  sql: string,
  bindings: Knex.RawBinding[],
  schema: FieldSchemaSpec | undefined,
): string {
  const defaultValue = defaultValueFromSchema(schema);
  if (defaultValue === undefined) return sql;
  bindings.push(defaultValue);
  return `${sql} DEFAULT ?`;
}

async function tableExists(trx: Knex.Transaction, table: string): Promise<boolean> {
  const result = await trx.raw<{ rows: { exists: boolean }[] }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ?
          AND table_type = 'BASE TABLE'
      ) AS exists
    `,
    [table],
  );
  return result.rows[0]?.exists === true;
}

async function columnExists(
  trx: Knex.Transaction,
  table: string,
  column: string,
): Promise<boolean> {
  const result = await trx.raw<{ rows: { exists: boolean }[] }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ?
          AND column_name = ?
      ) AS exists
    `,
    [table, column],
  );
  return result.rows[0]?.exists === true;
}

function composeCollection(
  collection: string,
  metaByCollection: Map<string, CollectionMeta>,
  schemaOverview: Record<string, ColumnInfo[]>,
): CollectionResult {
  const columns = schemaOverview[collection];
  return {
    collection,
    meta: metaByCollection.get(collection) ?? null,
    schema: columns ? { name: collection, columns } : null,
  };
}

function composeField(
  collection: string,
  field: string,
  meta: FieldMeta | null,
  schema: ColumnInfo | null,
): FieldResult {
  return {
    collection,
    field,
    type: deriveFieldType(schema?.data_type, meta),
    meta,
    schema,
  };
}

async function collectionMetaRows(trx: Knex | Knex.Transaction = db) {
  return trx<CollectionMeta>("directus_collections").select("*");
}

async function relationMetaRows(trx: Knex | Knex.Transaction = db) {
  return trx<RelationMeta>("directus_relations").select("*");
}

async function createTableWithFields(
  trx: Knex.Transaction,
  collection: string,
  fields: FieldSpec[] | undefined,
): Promise<void> {
  const specs =
    fields && fields.length > 0
      ? fields
      : [{ field: "id", type: "uuid", schema: { is_primary_key: true } }];

  const seen = new Set<string>();
  const columnSql: string[] = [];
  const bindings: Knex.RawBinding[] = [collection];

  for (const spec of specs) {
    assertSafeIdentifier(spec.field);
    if (seen.has(spec.field)) {
      throw new ApiError(400, "DUPLICATE_FIELD", `fieldが重複しています: ${spec.field}`);
    }
    seen.add(spec.field);

    let definition = "?? " + columnDefinition(spec.type, spec.schema);
    bindings.push(spec.field);
    definition = addDefaultClause(definition, bindings, spec.schema);
    columnSql.push(definition);
  }

  await trx.raw(`CREATE TABLE ?? (${columnSql.join(", ")})`, bindings);
}

async function addColumn(
  trx: Knex.Transaction,
  collection: string,
  field: string,
  type: string,
  schema: FieldSchemaSpec | undefined,
): Promise<void> {
  assertSafeIdentifier(collection);
  assertSafeIdentifier(field);

  const bindings: Knex.RawBinding[] = [collection, field];
  let definition = "?? " + columnDefinition(type, schema);
  definition = addDefaultClause(definition, bindings, schema);
  await trx.raw(`ALTER TABLE ?? ADD COLUMN ${definition}`, bindings);
}

function fieldMetaInsert(
  collection: string,
  field: string,
  meta: Record<string, unknown> | undefined,
  schema: FieldSchemaSpec | undefined,
) {
  return {
    collection,
    field,
    ...(schema?.is_nullable === false ? { required: true } : {}),
    ...meta,
  };
}

async function getCollectionMetaMap(): Promise<Map<string, CollectionMeta>> {
  const rows = await collectionMetaRows();
  return new Map(rows.map((row) => [row.collection, row]));
}

async function getFieldMetaMap(
  collection?: string,
): Promise<Map<string, FieldMeta>> {
  const query = db<FieldMeta>("directus_fields").select("*");
  if (collection) query.where({ collection });
  const rows = await query;
  return new Map(rows.map((row) => [`${row.collection}.${row.field}`, row]));
}

export async function listCollections(includeSystem: boolean): Promise<CollectionResult[]> {
  const [schemaOverview, metaByCollection] = await Promise.all([
    getSchemaOverview(),
    getCollectionMetaMap(),
  ]);

  const names = new Set([
    ...Object.keys(schemaOverview),
    ...Array.from(metaByCollection.keys()),
  ]);

  return Array.from(names)
    .filter((name) => includeSystem || !isSystemTableName(name))
    .sort()
    .map((name) => composeCollection(name, metaByCollection, schemaOverview));
}

/**
 * 名前だけを返す軽い一覧。
 *
 * 🚨 なぜ別に用意するか:
 * `listCollections` は `getSchemaOverview()` を呼ぶ。これは
 * **`information_schema.columns` を主キー・外部キーの副問い合わせと結合して全テーブル分読む**。
 * サイドバーは名前しか描画しないのに、**管理画面のどのページを開いてもこれが毎回走っていた**。
 *
 * 🚨 **件数を絞るだけでは軽くならない。** 返す数を 20 件にしても、
 * `getSchemaOverview()` は**全テーブルの全列を読んだあと**で捨てるだけだから。
 * 読む対象そのものを `information_schema.tables` に落とす必要がある。
 */
export async function listCollectionNames(
  includeSystem: boolean,
): Promise<{ collection: string }[]> {
  const [tables, metaByCollection] = await Promise.all([
    getTables(),
    getCollectionMetaMap(),
  ]);

  const names = new Set([...tables, ...Array.from(metaByCollection.keys())]);

  return Array.from(names)
    .filter((name) => includeSystem || !isSystemTableName(name))
    .sort()
    .map((collection) => ({ collection }));
}

export async function getCollection(
  collection: string,
): Promise<CollectionResult | null> {
  const [schemaOverview, metaByCollection] = await Promise.all([
    getSchemaOverview(),
    getCollectionMetaMap(),
  ]);

  if (!schemaOverview[collection] && !metaByCollection.has(collection)) return null;
  return composeCollection(collection, metaByCollection, schemaOverview);
}

export async function createCollection(
  body: Record<string, unknown>,
): Promise<CollectionResult> {
  if (typeof body.collection !== "string") {
    throw new ApiError(400, "INVALID_COLLECTION", "collectionは文字列で指定してください");
  }

  const collection = body.collection;
  const meta = pickAllowed(body.meta, COLLECTION_META_COLUMNS, "UNSUPPORTED_COLLECTION_META");
  const fields = parseFields(body.fields);

  assertPlainColumnsFreeInSpecs(fields);

  await db.transaction(async (trx) => {
    assertSafeIdentifier(collection);
    if (await tableExists(trx, collection)) {
      throw new ApiError(409, "COLLECTION_EXISTS", "コレクションは既に存在します");
    }

    await createTableWithFields(trx, collection, fields);
    await trx("directus_collections").insert({ collection, ...meta });

    if (fields) {
      for (const spec of fields) {
        await trx("directus_fields").insert(
          fieldMetaInsert(collection, spec.field, spec.meta, spec.schema),
        );
        // 🚨 あとからフィールドを足す経路（createField）と**同じ手当てをここでもやる**。
        // 片方だけだと「まとめて作ると保存はできるのに検索に出ない」コレクションができる
        // （sdk が実測で見つけた。GUI は通らないが SDK / CLI / MCP は通る経路）。
        await addPlainColumn(trx, collection, spec.field, spec.meta);
      }
    }
  });

  const created = await getCollection(collection);
  if (!created) {
    throw new ApiError(500, "COLLECTION_NOT_READABLE", "作成結果を取得できませんでした");
  }
  return created;
}

export async function updateCollection(
  collection: string,
  body: Record<string, unknown>,
): Promise<CollectionResult> {
  if (typeof body.collection === "string" && body.collection !== collection) {
    throw new ApiError(400, "RENAME_UNSUPPORTED", "MVPではテーブル名の変更に対応していません");
  }

  const meta = pickAllowed(body.meta ?? body, COLLECTION_META_COLUMNS, "UNSUPPORTED_COLLECTION_META");
  const updated = await db.transaction(async (trx) => {
    if (!(await tableExists(trx, collection))) {
      throw new ApiError(404, "COLLECTION_NOT_FOUND", "コレクションが見つかりません");
    }

    const existing = await trx<CollectionMeta>("directus_collections")
      .where({ collection })
      .first();

    if (existing) {
      await trx("directus_collections").where({ collection }).update(meta);
    } else {
      await trx("directus_collections").insert({ collection, ...meta });
    }

    return collection;
  });

  const result = await getCollection(updated);
  if (!result) throw new ApiError(404, "COLLECTION_NOT_FOUND", "コレクションが見つかりません");
  return result;
}

export async function deleteCollection(collection: string): Promise<{ collection: string }> {
  // 🚨 下の tableExists は「同時に2回」来ると素通りする（二重クリックの実体は並行）。
  // 後着は PostgreSQL の undefined_table で弾かれるので、その生エラーを文言へ翻訳する。
  try {
    await db.transaction(async (trx) => {
      assertSafeIdentifier(collection);
      if (!(await tableExists(trx, collection))) {
        throw new ApiError(404, "COLLECTION_NOT_FOUND", "コレクションが見つかりません");
      }

      await trx("directus_relations")
        .where({ many_collection: collection })
        .orWhere({ one_collection: collection })
        .delete();
      await trx("directus_fields").where({ collection }).delete();
      await trx("directus_collections").where({ collection }).delete();
      await trx.raw("DROP TABLE ??", [collection]);
    });
  } catch (error) {
    rethrowAsConflict(error);
    throw error;
  }

  return { collection };
}

export async function listFields(collection?: string): Promise<FieldResult[]> {
  const [schemaOverview, fieldMetaMap] = await Promise.all([
    getSchemaOverview(),
    getFieldMetaMap(collection),
  ]);

  const fieldKeys = new Set<string>();
  for (const [table, columns] of Object.entries(schemaOverview)) {
    if (collection && table !== collection) continue;
    for (const column of columns) {
      fieldKeys.add(`${table}.${column.name}`);
    }
  }
  for (const key of fieldMetaMap.keys()) fieldKeys.add(key);

  return Array.from(fieldKeys)
    .sort()
    .map((key) => {
      const separatorIndex = key.indexOf(".");
      const table = key.slice(0, separatorIndex);
      const field = key.slice(separatorIndex + 1);
      const schema =
        schemaOverview[table]?.find((column) => column.name === field) ?? null;
      const meta = fieldMetaMap.get(key) ?? null;
      return composeField(table, field, meta, schema);
    });
}

export async function getField(
  collection: string,
  field: string,
): Promise<FieldResult | null> {
  const fields = await listFields(collection);
  return fields.find((item) => item.field === field) ?? null;
}

function isRichTextMeta(meta: Record<string, unknown> | undefined): boolean {
  return meta?.interface === "richtext";
}

/**
 * まとめて作る経路（createCollection の fields）の衝突を、**テーブルを作る前に**見る。
 *
 * 表がまだ無いので `columnExists` では判定できない。指定された一覧の中だけで突き合わせる。
 * 本文 `body` と `body_plain` を同時に指定されると、相方を足すときに重複列で落ちるため。
 */
function assertPlainColumnsFreeInSpecs(fields: FieldSpec[] | undefined): void {
  if (!fields) return;
  const names = new Set(fields.map((spec) => spec.field));

  for (const spec of fields) {
    if (!isRichTextMeta(spec.meta)) continue;
    const plain = plainColumnName(spec.field);
    if (names.has(plain)) {
      throw new ApiError(
        409,
        "PLAIN_COLUMN_EXISTS",
        `本文の検索用に ${plain} を使います。同じ名前のフィールドも指定されているので、どちらかの名前を変えてください`,
      );
    }
  }
}

/**
 * 本文フィールドと、検索用の相方の列（`<field>_plain`）の名前がぶつからないか見る。
 *
 * 🚨 このCMSは GUI で誰でもフィールドを作れるので、**利用者が自分で `body_plain` を
 * 作れてしまう**。あとから本文 `body` を作ると相方の名前が衝突する（逆もある）。
 * 名前を予約記号で汚すより、**作るときに断る**方を選んだ。
 */
async function assertPlainColumnFree(
  trx: Knex.Transaction,
  collection: string,
  field: string,
  meta: Record<string, unknown> | undefined,
): Promise<void> {
  if (isRichTextMeta(meta)) {
    const plain = plainColumnName(field);
    assertSafeIdentifier(plain);
    if (await columnExists(trx, collection, plain)) {
      throw new ApiError(
        409,
        "PLAIN_COLUMN_EXISTS",
        `本文の検索用に ${plain} を使います。同じ名前のフィールドが既にあるので、どちらかの名前を変えてください`,
      );
    }
    return;
  }

  // 逆向き: `body_plain` を手で作ろうとしていて、`body` が本文だった場合
  const suffix = "_plain";
  if (!field.endsWith(suffix)) return;
  const owner = field.slice(0, -suffix.length);
  if (owner === "") return;

  const ownerMeta = await trx("directus_fields")
    .select("interface")
    .where({ collection, field: owner })
    .first() as { interface: string | null } | undefined;

  if (ownerMeta?.interface === "richtext") {
    throw new ApiError(
      409,
      "PLAIN_COLUMN_RESERVED",
      `${field} は本文フィールド ${owner} の検索用に予約されています。別の名前にしてください`,
    );
  }
}

/**
 * 本文フィールドを作ったら、検索用の相方の列も同じ取引の中で作る。
 *
 * 🚨 `text` 型にすること。`lib/search/service.ts` の `isSearchableColumn` が
 * `/char|text|citext/` を見ているので、text なら横断検索が無改修で拾う。
 * `hidden` を立てるのは、書き手に生のテキスト欄を見せないため（中身は本文から導出される）。
 */
async function addPlainColumn(
  trx: Knex.Transaction,
  collection: string,
  field: string,
  meta: Record<string, unknown> | undefined,
): Promise<void> {
  if (!isRichTextMeta(meta)) return;

  const plain = plainColumnName(field);
  assertSafeIdentifier(plain);
  await trx.raw("ALTER TABLE ?? ADD COLUMN ?? text", [collection, plain]);
  await trx("directus_fields").insert({
    collection,
    field: plain,
    interface: "input",
    hidden: true,
    readonly: true,
    note: `${field} の検索用。本文を保存すると自動で更新されます`,
  });
}

export async function createField(
  collection: string,
  body: Record<string, unknown>,
): Promise<FieldResult> {
  if (typeof body.field !== "string" || typeof body.type !== "string") {
    throw new ApiError(400, "INVALID_FIELD", "fieldとtypeは文字列で指定してください");
  }

  const field = body.field;
  const schema = parseFieldSchema(body.schema);
  const meta = pickAllowed(body.meta, FIELD_META_COLUMNS, "UNSUPPORTED_FIELD_META");

  // 🚨 columnExists は「同時に2回」来ると両方が false を見る（二重クリックの実体は並行）。
  // 後着は PostgreSQL の duplicate_column で弾かれる。データは壊れないが、
  // 生エラーのままだと「サーバ内部でエラーが発生しました」になるので文言へ翻訳する。
  try {
    await db.transaction(async (trx) => {
      assertSafeIdentifier(collection);
      assertSafeIdentifier(field);

      if (!(await tableExists(trx, collection))) {
        throw new ApiError(404, "COLLECTION_NOT_FOUND", "コレクションが見つかりません");
      }
      if (await columnExists(trx, collection, field)) {
        throw new ApiError(409, "FIELD_EXISTS", "フィールドはもう作られています");
      }
      await assertPlainColumnFree(trx, collection, field, meta);

      await addColumn(trx, collection, field, body.type as string, schema);
      await trx("directus_fields").insert(
        fieldMetaInsert(collection, field, meta, schema),
      );
      await addPlainColumn(trx, collection, field, meta);
    });
  } catch (error) {
    rethrowAsConflict(error);
    throw error;
  }

  const created = await getField(collection, field);
  if (!created) throw new ApiError(500, "FIELD_NOT_READABLE", "作成結果を取得できませんでした");
  return created;
}

export async function updateField(
  collection: string,
  field: string,
  body: Record<string, unknown>,
): Promise<FieldResult> {
  if (typeof body.field === "string" && body.field !== field) {
    throw new ApiError(400, "RENAME_UNSUPPORTED", "MVPではフィールド名の変更に対応していません");
  }

  const meta = body.meta === undefined
    ? {}
    : pickAllowed(body.meta, FIELD_META_COLUMNS, "UNSUPPORTED_FIELD_META");
  const schema = parseFieldSchemaPatch(body.schema);

  await db.transaction(async (trx) => {
    assertSafeIdentifier(collection);
    assertSafeIdentifier(field);

    const hasTable = await tableExists(trx, collection);
    const hasColumn = hasTable ? await columnExists(trx, collection, field) : false;
    const existingMeta = await trx<FieldMeta>("directus_fields")
      .where({ collection, field })
      .first();

    if (!hasTable || (!hasColumn && !existingMeta)) {
      throw new ApiError(404, "FIELD_NOT_FOUND", "フィールドが見つかりません");
    }

    if (schema && hasColumn) {
      if (schema.is_nullable === true) {
        await trx.raw("ALTER TABLE ?? ALTER COLUMN ?? DROP NOT NULL", [
          collection,
          field,
        ]);
      } else if (schema.is_nullable === false) {
        await trx.raw("ALTER TABLE ?? ALTER COLUMN ?? SET NOT NULL", [
          collection,
          field,
        ]);
      }

      if (Object.hasOwn(schema, "default") || Object.hasOwn(schema, "column_default")) {
        const defaultValue = defaultValueFromSchema(schema);
        if (defaultValue === null) {
          await trx.raw("ALTER TABLE ?? ALTER COLUMN ?? DROP DEFAULT", [
            collection,
            field,
          ]);
        } else if (defaultValue !== undefined) {
          await trx.raw("ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT ?", [
            collection,
            field,
            defaultValue,
          ]);
        }
      }
    }

    if (Object.keys(meta).length > 0) {
      if (existingMeta) {
        await trx("directus_fields").where({ collection, field }).update(meta);
      } else {
        await trx("directus_fields").insert({ collection, field, ...meta });
      }
    }
  });

  const updated = await getField(collection, field);
  if (!updated) throw new ApiError(404, "FIELD_NOT_FOUND", "フィールドが見つかりません");
  return updated;
}

export async function deleteField(
  collection: string,
  field: string,
): Promise<{ collection: string; field: string }> {
  await db.transaction(async (trx) => {
    assertSafeIdentifier(collection);
    assertSafeIdentifier(field);

    if (!(await tableExists(trx, collection))) {
      throw new ApiError(404, "COLLECTION_NOT_FOUND", "コレクションが見つかりません");
    }

    const hasColumn = await columnExists(trx, collection, field);
    const deleted = await trx("directus_fields").where({ collection, field }).delete();
    await trx("directus_relations")
      .where({ many_collection: collection, many_field: field })
      .orWhere({ one_collection: collection, one_field: field })
      .delete();

    if (!hasColumn && deleted === 0) {
      throw new ApiError(404, "FIELD_NOT_FOUND", "フィールドが見つかりません");
    }
    if (hasColumn) {
      await trx.raw("ALTER TABLE ?? DROP COLUMN ??", [collection, field]);
    }
  });

  return { collection, field };
}

function composeRelation(
  relation: RelationMeta,
  schemaOverview: Record<string, ColumnInfo[]>,
): RelationResult {
  const column = schemaOverview[relation.many_collection]?.find(
    (item) => item.name === relation.many_field,
  );

  return {
    many_collection: relation.many_collection,
    many_field: relation.many_field,
    meta: relation,
    schema: column
      ? {
          foreign_key_table: column.foreign_key_table,
          foreign_key_column: column.foreign_key_column,
        }
      : null,
  };
}

async function findForeignKeyConstraint(
  trx: Knex.Transaction,
  manyCollection: string,
  manyField: string,
): Promise<string | null> {
  const result = await trx.raw<{ rows: { constraint_name: string }[] }>(
    `
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
        AND tc.table_name = kcu.table_name
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ?
        AND kcu.column_name = ?
      LIMIT 1
    `,
    [manyCollection, manyField],
  );

  return result.rows[0]?.constraint_name ?? null;
}

function relationConstraintName(manyCollection: string, manyField: string): string {
  const name = `${manyCollection}_${manyField}_foreign`;
  return name.length <= 63 ? name : name.slice(0, 63);
}

export async function listRelations(): Promise<RelationResult[]> {
  const [rows, schemaOverview] = await Promise.all([
    relationMetaRows(),
    getSchemaOverview(),
  ]);
  return rows.map((row) => composeRelation(row, schemaOverview));
}

export async function getRelation(
  manyCollection: string,
  manyField: string,
): Promise<RelationResult | null> {
  const row = await db<RelationMeta>("directus_relations")
    .where({ many_collection: manyCollection, many_field: manyField })
    .first();
  if (!row) return null;

  const schemaOverview = await getSchemaOverview();
  return composeRelation(row, schemaOverview);
}

export async function createRelation(
  body: Record<string, unknown>,
): Promise<RelationResult> {
  const manyCollection = body.many_collection;
  const manyField = body.many_field;
  const manyPrimary = body.many_primary ?? "id";
  const oneCollection = body.one_collection;
  const onePrimary = body.one_primary ?? "id";

  if (
    typeof manyCollection !== "string" ||
    typeof manyField !== "string" ||
    typeof manyPrimary !== "string"
  ) {
    throw new ApiError(
      400,
      "INVALID_RELATION",
      "many_collection, many_field, many_primaryは文字列で指定してください",
    );
  }
  if (oneCollection !== undefined && oneCollection !== null && typeof oneCollection !== "string") {
    throw new ApiError(400, "INVALID_RELATION", "one_collectionは文字列で指定してください");
  }
  if (onePrimary !== undefined && onePrimary !== null && typeof onePrimary !== "string") {
    throw new ApiError(400, "INVALID_RELATION", "one_primaryは文字列で指定してください");
  }

  const meta = pickAllowed(
    { ...body, many_primary: manyPrimary, one_primary: onePrimary },
    RELATION_META_COLUMNS,
    "UNSUPPORTED_RELATION_META",
  );

  await db.transaction(async (trx) => {
    assertSafeIdentifier(manyCollection);
    assertSafeIdentifier(manyField);
    assertSafeIdentifier(manyPrimary);
    if (typeof oneCollection === "string") assertSafeIdentifier(oneCollection);
    if (typeof onePrimary === "string") assertSafeIdentifier(onePrimary);

    const existing = await trx<RelationMeta>("directus_relations")
      .where({ many_collection: manyCollection, many_field: manyField })
      .first();
    if (existing) {
      throw new ApiError(409, "RELATION_EXISTS", "リレーションは既に存在します");
    }

    if (!(await tableExists(trx, manyCollection)) || !(await columnExists(trx, manyCollection, manyField))) {
      throw new ApiError(404, "MANY_FIELD_NOT_FOUND", "many側のフィールドが見つかりません");
    }

    if (typeof oneCollection === "string" && typeof onePrimary === "string") {
      if (!(await tableExists(trx, oneCollection)) || !(await columnExists(trx, oneCollection, onePrimary))) {
        throw new ApiError(404, "ONE_FIELD_NOT_FOUND", "one側のフィールドが見つかりません");
      }

      if (!(await findForeignKeyConstraint(trx, manyCollection, manyField))) {
        await trx.raw(
          "ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (??) REFERENCES ?? (??)",
          [
            manyCollection,
            relationConstraintName(manyCollection, manyField),
            manyField,
            oneCollection,
            onePrimary,
          ],
        );
      }
    }

    await trx("directus_relations").insert(meta);
  });

  const created = await getRelation(manyCollection, manyField);
  if (!created) throw new ApiError(500, "RELATION_NOT_READABLE", "作成結果を取得できませんでした");
  return created;
}

export async function updateRelation(
  manyCollection: string,
  manyField: string,
  body: Record<string, unknown>,
): Promise<RelationResult> {
  if (
    (typeof body.many_collection === "string" && body.many_collection !== manyCollection) ||
    (typeof body.many_field === "string" && body.many_field !== manyField)
  ) {
    throw new ApiError(
      400,
      "RELATION_RENAME_UNSUPPORTED",
      "MVPではリレーションキーの変更に対応していません",
    );
  }

  const meta = pickAllowed(body, RELATION_META_COLUMNS, "UNSUPPORTED_RELATION_META");
  delete meta.many_collection;
  delete meta.many_field;

  await db.transaction(async (trx) => {
    const existing = await trx<RelationMeta>("directus_relations")
      .where({ many_collection: manyCollection, many_field: manyField })
      .first();
    if (!existing) {
      throw new ApiError(404, "RELATION_NOT_FOUND", "リレーションが見つかりません");
    }

    await trx("directus_relations")
      .where({ many_collection: manyCollection, many_field: manyField })
      .update(meta);
  });

  const updated = await getRelation(manyCollection, manyField);
  if (!updated) throw new ApiError(404, "RELATION_NOT_FOUND", "リレーションが見つかりません");
  return updated;
}

export async function deleteRelation(
  manyCollection: string,
  manyField: string,
): Promise<{ many_collection: string; many_field: string }> {
  await db.transaction(async (trx) => {
    assertSafeIdentifier(manyCollection);
    assertSafeIdentifier(manyField);

    const deleted = await trx("directus_relations")
      .where({ many_collection: manyCollection, many_field: manyField })
      .delete();
    if (deleted === 0) {
      throw new ApiError(404, "RELATION_NOT_FOUND", "リレーションが見つかりません");
    }

    const constraintName = await findForeignKeyConstraint(trx, manyCollection, manyField);
    if (constraintName) {
      await trx.raw("ALTER TABLE ?? DROP CONSTRAINT ??", [
        manyCollection,
        constraintName,
      ]);
    }
  });

  return { many_collection: manyCollection, many_field: manyField };
}

export async function columnsForCollection(collection: string): Promise<ColumnInfo[]> {
  return getColumns(collection);
}
