import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import {
  resolvePermission,
  type PermissionAction,
  type PermissionResolution,
} from "@/lib/permissions/resolve";
import { ApiError, rethrowAsConflict, type FieldIssue } from "@/lib/schema/errors";
import { getSchemaOverview } from "@/lib/schema/introspect";
import type { ColumnInfo, RelationMeta } from "@/lib/schema/models";
import { assertSafeIdentifier, isSystemTableName } from "@/lib/schema/validate";
import { DELETED_AT_COLUMN, INTERNAL_COLUMNS } from "@/lib/schema/service";
import { applyFilter, type FilterObject } from "./filter";
import { sanitizeRichTextFields } from "./richtext";
import {
  applyValidatedSort,
  buildQuery,
  countItems,
  needsRelationMetadata,
  parseQueryOptions,
  selectedBaseColumns,
  type DeepOptions,
  type FieldSelection,
  type ItemsQueryInput,
  type ParsedQueryOptions,
  type SortSpec,
} from "./query";
import {
  assertColumnExists,
  columnsFor,
  getPrimaryKey,
  resolveRelation,
  type SchemaOverview,
} from "./relations";

export type Item = Record<string, unknown>;

/**
 * 記事の書込リクエストから渡される、activity ログ用の最小コンテキスト。
 * 🚨 lib/ は next/* を import しない（AGENTS.md §3.6）ので、route 側でヘッダから
 * 素の値を取り出してここへ渡す（apps/studio/app/api/items/**の route.ts を参照）。
 */
export type ActivityContext = {
  ip: string;
  userAgent: string | null;
};

type ActivityAction = "create" | "update" | "delete";

/**
 * directus_activity へ1行 insert する。呼び出し側の transaction (trx) の中で呼ぶこと
 * （記事の書込がロールバックされたらログも残らないようにするため）。
 * 🚨 記事本文（body の中身）は入れない。who/when/what のメタだけ。
 */
async function recordActivity(
  trx: Knex.Transaction,
  actor: Actor,
  action: ActivityAction,
  collection: string,
  item: string,
  context: ActivityContext,
): Promise<void> {
  await trx("directus_activity").insert({
    action,
    user: actor.type === "human" ? actor.userId : null,
    actor_type: actor.type,
    actor_id: actor.type === "agent" ? actor.agentId : null,
    collection,
    item,
    ip: context.ip,
    user_agent: context.userAgent,
  });
}

export type ItemsListResult = {
  data: Item[];
  meta?: {
    total_count?: number;
    filter_count?: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function relationRows(): Promise<RelationMeta[]> {
  return db<RelationMeta>("directus_relations").select("*");
}

function assertUserCollection(
  collection: string,
  schemaOverview: SchemaOverview,
): ColumnInfo[] {
  if (isSystemTableName(collection)) {
    throw new ApiError(
      403,
      "SYSTEM_COLLECTION_FORBIDDEN",
      "システムテーブルはitems APIからアクセスできません",
    );
  }

  assertSafeIdentifier(collection);
  const columns = schemaOverview[collection];
  if (!columns) {
    throw new ApiError(404, "COLLECTION_NOT_FOUND", "コレクションが見つかりません");
  }
  return columns;
}

function throwItemNotFound(): never {
  throw new ApiError(404, "ITEM_NOT_FOUND", "アイテムが見つかりません");
}

function isPostgresUuidInput(value: string): boolean {
  const wrapped = value.startsWith("{") || value.endsWith("}");
  if (wrapped && !(value.startsWith("{") && value.endsWith("}"))) return false;
  const body = wrapped ? value.slice(1, -1) : value;
  let hex = 0;
  for (const char of body) {
    if (/^[0-9a-fA-F]$/.test(char)) {
      hex += 1;
      continue;
    }
    if (char === "-") {
      if (hex === 0 || hex === 32 || hex % 4 !== 0) return false;
      continue;
    }
    return false;
  }
  return hex === 32;
}

function isPostgresIntegerInput(value: string, column: ColumnInfo): boolean {
  const text = value.trim();
  if (!/^[+-]?\d+$/.test(text)) return false;
  const number = BigInt(text);
  if (column.data_type === "smallint") {
    return number >= BigInt("-32768") && number <= BigInt("32767");
  }
  if (column.data_type === "integer") {
    return number >= BigInt("-2147483648") && number <= BigInt("2147483647");
  }
  if (column.data_type === "bigint") {
    return (
      number >= BigInt("-9223372036854775808") &&
      number <= BigInt("9223372036854775807")
    );
  }
  return true;
}

function assertPrimaryKeyIdMatchesType(id: string, primaryKey: ColumnInfo | undefined): void {
  if (!primaryKey) return;
  if (primaryKey.data_type === "uuid" && !isPostgresUuidInput(id)) {
    throwItemNotFound();
  }
  if (
    (primaryKey.data_type === "smallint" ||
      primaryKey.data_type === "integer" ||
      primaryKey.data_type === "bigint") &&
    !isPostgresIntegerInput(id, primaryKey)
  ) {
    throwItemNotFound();
  }
}

function queryInputFromUrl(url: URL): ItemsQueryInput {
  return {
    fields: url.searchParams.get("fields"),
    filter: url.searchParams.get("filter"),
    sort: url.searchParams.get("sort"),
    limit: url.searchParams.get("limit"),
    offset: url.searchParams.get("offset"),
    page: url.searchParams.get("page"),
    meta: url.searchParams.get("meta"),
    deep: url.searchParams.get("deep"),
  };
}

export function itemsQueryFromRequest(request: Request): ItemsQueryInput {
  return queryInputFromUrl(new URL(request.url));
}

function assertPermission(permission: PermissionResolution): void {
  if (!permission.allowed) {
    throw new ApiError(403, "PERMISSION_DENIED", "権限がありません");
  }
}

function assertFieldAllowed(
  allowedFields: PermissionResolution["allowedFields"],
  field: string,
): void {
  if (allowedFields === "*") return;
  if (!allowedFields.includes(field)) {
    throw new ApiError(403, "FIELD_FORBIDDEN", `許可されていないフィールドです: ${field}`);
  }
}

function assertSelectionAllowed(
  collection: string,
  selection: FieldSelection,
  deep: DeepOptions,
  allowedFields: PermissionResolution["allowedFields"],
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  permissionMap: Map<string, PermissionResolution>,
): void {
  if (allowedFields !== "*") {
    if (selection.includeAllScalars) {
      throw new ApiError(403, "FIELD_FORBIDDEN", "許可されていないフィールドが含まれています");
    }

    for (const field of selection.scalarFields) {
      assertFieldAllowed(allowedFields, field);
    }
  }

  for (const [field, childSelection] of selection.relations.entries()) {
    if (allowedFields !== "*") {
      assertFieldAllowed(allowedFields, field);
    }

    const relation = resolveRelation(schemaOverview, relations, collection, field);
    if (!relation) continue;

    const childDeep = relationDeepOptions(deep, field);
    const childDeepFilter = parseDeepFilter(childDeep);
    const targetPermission = permissionMap.get(relation.targetCollection);
    if (!targetPermission || !targetPermission.allowed) {
      if (childDeepFilter) {
        throw new ApiError(403, "PERMISSION_DENIED", "権限がありません");
      }
      continue;
    }

    assertSelectionAllowed(
      relation.targetCollection,
      childSelection,
      childDeep,
      targetPermission.allowedFields,
      schemaOverview,
      relations,
      permissionMap,
    );
    if (childDeepFilter) {
      assertFilterAllowed(
        relation.targetCollection,
        childDeepFilter,
        targetPermission.allowedFields,
        schemaOverview,
        relations,
        permissionMap,
      );
    }
  }
}

function hasOperatorKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => key.startsWith("_"));
}

function assertFilterAllowed(
  collection: string,
  filter: unknown,
  allowedFields: PermissionResolution["allowedFields"],
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  permissionMap: Map<string, PermissionResolution>,
): void {
  if (filter === undefined || filter === null) return;
  if (!isRecord(filter)) return;

  for (const [key, value] of Object.entries(filter)) {
    if (key === "_and" || key === "_or") {
      if (Array.isArray(value)) {
        for (const child of value) {
          assertFilterAllowed(
            collection,
            child,
            allowedFields,
            schemaOverview,
            relations,
            permissionMap,
          );
        }
      }
      continue;
    }
    if (key.startsWith("_")) continue;

    if (allowedFields !== "*") {
      assertFieldAllowed(allowedFields, key);
    }
    if (isRecord(value) && !hasOperatorKeys(value)) {
      const relation = resolveRelation(schemaOverview, relations, collection, key);
      if (!relation) continue;

      const targetPermission = permissionMap.get(relation.targetCollection);
      if (!targetPermission || !targetPermission.allowed) {
        throw new ApiError(403, "PERMISSION_DENIED", "権限がありません");
      }

      assertFilterAllowed(
        relation.targetCollection,
        value,
        targetPermission.allowedFields,
        schemaOverview,
        relations,
        permissionMap,
      );
    }
  }
}

function assertSortAllowed(
  sort: SortSpec[],
  allowedFields: PermissionResolution["allowedFields"],
): void {
  if (allowedFields === "*") return;
  for (const spec of sort) {
    assertFieldAllowed(allowedFields, spec.field);
  }
}

function assertPayloadAllowed(
  payload: Item,
  allowedFields: PermissionResolution["allowedFields"],
): void {
  if (allowedFields === "*") return;
  for (const key of Object.keys(payload)) {
    assertFieldAllowed(allowedFields, key);
  }
}

function filterItemFields(
  item: Item,
  allowedFields: PermissionResolution["allowedFields"],
): Item {
  if (allowedFields === "*") return item;
  const allowed = new Set(allowedFields);
  return Object.fromEntries(
    Object.entries(item).filter(([field]) => allowed.has(field)),
  );
}

function filterResultFields(
  item: Item | Item[],
  allowedFields: PermissionResolution["allowedFields"],
): Item | Item[] {
  if (allowedFields === "*") return item;
  return Array.isArray(item)
    ? item.map((row) => filterItemFields(row, allowedFields))
    : filterItemFields(item, allowedFields);
}

function queryWithDefaultAllowedFields(
  query: ItemsQueryInput,
  permission: PermissionResolution,
  primaryKey: string,
): ItemsQueryInput {
  if (permission.allowedFields === "*" || query.fields) return query;
  return {
    ...query,
    fields: permission.allowedFields.length > 0
      ? permission.allowedFields.join(",")
      : primaryKey,
  };
}

async function permissionForAction(
  actor: Actor,
  collection: string,
  action: PermissionAction,
): Promise<PermissionResolution> {
  const permission = await resolvePermission(actor, collection, action);
  assertPermission(permission);
  return permission;
}

async function loadRelationsIfNeeded(
  collection: string,
  schemaOverview: SchemaOverview,
  options: ParsedQueryOptions,
  extraFilter?: FilterObject | null,
): Promise<RelationMeta[]> {
  if (
    extraFilter ||
    needsRelationMetadata(collection, schemaOverview, options.selection, options.filter)
  ) {
    return relationRows();
  }
  return [];
}

function collectRelationTargetsFromFilter(
  collection: string,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  filter: unknown,
  targets: Set<string>,
): void {
  if (!isRecord(filter)) return;

  for (const [key, value] of Object.entries(filter)) {
    if (key === "_and" || key === "_or") {
      if (Array.isArray(value)) {
        for (const child of value) {
          collectRelationTargetsFromFilter(
            collection,
            schemaOverview,
            relations,
            child,
            targets,
          );
        }
      }
      continue;
    }
    if (key.startsWith("_")) continue;
    if (!isRecord(value) || hasOperatorKeys(value)) continue;

    const relation = resolveRelation(schemaOverview, relations, collection, key);
    if (!relation) continue;

    targets.add(relation.targetCollection);
    collectRelationTargetsFromFilter(
      relation.targetCollection,
      schemaOverview,
      relations,
      value,
      targets,
    );
  }
}

function collectRelationTargetsFromSelection(
  collection: string,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  selection: FieldSelection,
  deep: DeepOptions,
  targets: Set<string>,
): void {
  for (const [field, childSelection] of selection.relations.entries()) {
    const relation = resolveRelation(schemaOverview, relations, collection, field);
    if (!relation) continue;

    targets.add(relation.targetCollection);
    const childDeep = relationDeepOptions(deep, field);
    collectRelationTargetsFromFilter(
      relation.targetCollection,
      schemaOverview,
      relations,
      parseDeepFilter(childDeep),
      targets,
    );
    collectRelationTargetsFromSelection(
      relation.targetCollection,
      schemaOverview,
      relations,
      childSelection,
      childDeep,
      targets,
    );
  }
}

function collectRelationTargets(
  collection: string,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  selection: FieldSelection,
  filter: FilterObject | undefined,
  deep: DeepOptions,
): Set<string> {
  const targets = new Set<string>();
  collectRelationTargetsFromSelection(
    collection,
    schemaOverview,
    relations,
    selection,
    deep,
    targets,
  );
  collectRelationTargetsFromFilter(collection, schemaOverview, relations, filter, targets);
  return targets;
}

async function resolvePermissionMap(
  actor: Actor,
  targets: Set<string>,
): Promise<Map<string, PermissionResolution>> {
  const entries = await Promise.all(
    Array.from(targets).map(async (target) => [
      target,
      await resolvePermission(actor, target, "read"),
    ] as const),
  );
  return new Map(entries);
}

function rowFilterPermissionMap(
  permissionMap: Map<string, PermissionResolution>,
): Map<string, FilterObject | null> {
  return new Map(
    Array.from(permissionMap, ([collection, permission]) => [
      collection,
      permission.allowed ? permission.rowFilter : null,
    ]),
  );
}

function relationDeepOptions(deep: DeepOptions, field: string): DeepOptions {
  const value = deep[field];
  return isRecord(value) ? value : {};
}

function parseDeepLimit(deep: DeepOptions): number | null {
  const value = deep._limit;
  if (value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError(400, "INVALID_DEEP", "deep._limitは0以上の整数で指定してください");
  }
  return parsed;
}

function parseDeepSort(deep: DeepOptions): string | null {
  const value = deep._sort;
  if (value === undefined) return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_DEEP", "deep._sortは文字列で指定してください");
  }
  return value;
}

function parseDeepFilter(deep: DeepOptions): FilterObject | undefined {
  const value = deep._filter;
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new ApiError(400, "INVALID_DEEP", "deep._filterはオブジェクトで指定してください");
  }
  return value;
}

function internalColumnsForRelation(
  collection: string,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  selection: FieldSelection,
  requiredColumn: string,
): string[] {
  const selected = new Set(
    selectedBaseColumns(collection, schemaOverview, relations, selection),
  );
  selected.add(requiredColumn);
  return Array.from(selected);
}

function projectItem(
  item: Item,
  collection: string,
  schemaOverview: SchemaOverview,
  selection: FieldSelection,
): Item {
  const result: Item = {};
  const scalarNames = new Set(columnsFor(schemaOverview, collection).map((column) => column.name));

  if (selection.includeAllScalars) {
    for (const field of scalarNames) {
      result[field] = item[field];
    }
  } else {
    for (const field of selection.scalarFields) {
      result[field] = item[field];
    }
  }

  for (const field of selection.relations.keys()) {
    result[field] = item[field];
  }

  return result;
}

function uniqueValues(items: Item[], field: string): unknown[] {
  return Array.from(
    new Set(
      items
        .map((item) => item[field])
        .filter((value) => value !== null && value !== undefined),
    ),
  );
}

function whereInValues(
  query: Knex.QueryBuilder<Record<string, unknown>, unknown[]>,
  field: string,
  values: readonly unknown[],
): void {
  const typedQuery = query as unknown as {
    whereIn: (column: string, values: readonly unknown[]) => void;
  };
  typedQuery.whereIn(field, values);
}

async function resolveRelationsForItems(
  items: Item[],
  collection: string,
  selection: FieldSelection,
  deep: DeepOptions,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  permissionMap: Map<string, PermissionResolution>,
): Promise<void> {
  if (items.length === 0 || selection.relations.size === 0) return;

  const filterPermissionMap = rowFilterPermissionMap(permissionMap);

  for (const [field, childSelection] of selection.relations.entries()) {
    const relation = resolveRelation(schemaOverview, relations, collection, field);
    if (!relation) {
      throw new ApiError(400, "UNKNOWN_RELATION", `存在しないリレーションです: ${field}`);
    }

    const childDeep = relationDeepOptions(deep, field);
    const childFilter = parseDeepFilter(childDeep);
    const childSort = parseDeepSort(childDeep);
    const targetPermission = permissionMap.get(relation.targetCollection);
    if (!targetPermission || !targetPermission.allowed) {
      for (const item of items) item[field] = relation.kind === "m2o" ? null : [];
      continue;
    }

    if (relation.kind === "m2o") {
      const keys = uniqueValues(items, relation.sourceColumn);
      if (keys.length === 0) {
        for (const item of items) item[field] = null;
        continue;
      }

      const selectedColumns = internalColumnsForRelation(
        relation.targetCollection,
        schemaOverview,
        relations,
        childSelection,
        relation.targetColumn,
      );
      // 🚨 **関連の取得も入口を通す**（2026-08-16・自分で見つけた漏れ）。
    //    ここは `db(relation.targetCollection)` を直に開いていたので、
    //    **ゴミ箱に入れた行が「関連する項目」として出続ける**形だった。
    //    （実データにリレーションが 0 件なので**実測では出ていない**——**コードで見つけた漏れ**）
    // 🚨 相手の表に列が在るかは、**相手について**確かめないと分からない
    //    （`列が在る` は「開いたことのある表」しか知らないため）。
    await ensureDeletedAtColumn(db, relation.targetCollection);
    const query = itemsTable(db, relation.targetCollection)
        .select(selectedColumns)
      whereInValues(query, relation.targetColumn, keys);
      if (targetPermission.rowFilter) {
        applyFilter(query, targetPermission.rowFilter, {
          collection: relation.targetCollection,
          schemaOverview,
          relations,
          permissionMap: filterPermissionMap,
        });
      }
      if (childFilter) {
        applyFilter(query, childFilter, {
          collection: relation.targetCollection,
          schemaOverview,
          relations,
          permissionMap: filterPermissionMap,
        });
      }
      if (childSort) {
        applyValidatedSort(
          query,
          relation.targetCollection,
          schemaOverview,
          parseQueryOptions({ sort: childSort }).sort,
        );
      }

      const children = (await query) as Item[];
      await resolveRelationsForItems(
        children,
        relation.targetCollection,
        childSelection,
        childDeep,
        schemaOverview,
        relations,
        permissionMap,
      );

      const childByKey = new Map(
        children.map((child) => [
          String(child[relation.targetColumn]),
          projectItem(child, relation.targetCollection, schemaOverview, childSelection),
        ]),
      );
      for (const item of items) {
        const key = item[relation.sourceColumn];
        item[field] =
          key === null || key === undefined ? null : childByKey.get(String(key)) ?? null;
      }
      continue;
    }

    const keys = uniqueValues(items, relation.sourceColumn);
    if (keys.length === 0) {
      for (const item of items) item[field] = [];
      continue;
    }

    const selectedColumns = internalColumnsForRelation(
      relation.targetCollection,
      schemaOverview,
      relations,
      childSelection,
      relation.targetColumn,
    );
    // 🚨 **関連の取得も入口を通す**（2026-08-16・自分で見つけた漏れ）。
    //    ここは `db(relation.targetCollection)` を直に開いていたので、
    //    **ゴミ箱に入れた行が「関連する項目」として出続ける**形だった。
    //    （実データにリレーションが 0 件なので**実測では出ていない**——**コードで見つけた漏れ**）
    // 🚨 相手の表に列が在るかは、**相手について**確かめないと分からない
    //    （`列が在る` は「開いたことのある表」しか知らないため）。
    await ensureDeletedAtColumn(db, relation.targetCollection);
    const query = itemsTable(db, relation.targetCollection)
      .select(selectedColumns)
    whereInValues(query, relation.targetColumn, keys);
    if (targetPermission.rowFilter) {
      applyFilter(query, targetPermission.rowFilter, {
        collection: relation.targetCollection,
        schemaOverview,
        relations,
        permissionMap: filterPermissionMap,
      });
    }
    if (childFilter) {
      applyFilter(query, childFilter, {
        collection: relation.targetCollection,
        schemaOverview,
        relations,
        permissionMap: filterPermissionMap,
      });
    }
    if (childSort) {
      applyValidatedSort(
        query,
        relation.targetCollection,
        schemaOverview,
        parseQueryOptions({ sort: childSort }).sort,
      );
    }

    const children = (await query) as Item[];
    await resolveRelationsForItems(
      children,
      relation.targetCollection,
      childSelection,
      childDeep,
      schemaOverview,
      relations,
      permissionMap,
    );

    const grouped = new Map<string, Item[]>();
    for (const child of children) {
      const key = child[relation.targetColumn];
      if (key === null || key === undefined) continue;
      const group = grouped.get(String(key)) ?? [];
      group.push(projectItem(child, relation.targetCollection, schemaOverview, childSelection));
      grouped.set(String(key), group);
    }

    const limit = parseDeepLimit(childDeep);
    for (const item of items) {
      const childrenForItem = grouped.get(String(item[relation.sourceColumn])) ?? [];
      item[field] = limit === null ? childrenForItem : childrenForItem.slice(0, limit);
    }
  }
}

async function itemsWithRelations(
  collection: string,
  rows: Item[],
  options: ParsedQueryOptions,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  permissionMap: Map<string, PermissionResolution>,
): Promise<Item[]> {
  await resolveRelationsForItems(
    rows,
    collection,
    options.selection,
    options.deep,
    schemaOverview,
    relations,
    permissionMap,
  );
  return rows.map((row) => projectItem(row, collection, schemaOverview, options.selection));
}

/**
 * 🚨 **利用者が作った表を開く、唯一の入口**（設問288 A・2026-08-16）。
 *
 * ご指示は「**全ての削除はソフトデリート**」で、**利用者が作った表も対象**と決まった。
 * ＝ **消えた行を読まない条件**が、表を開くすべての場所に要る。
 *
 * 🚨 **各所に手で書かせない。** 書かせると、**1 箇所でも漏れたときに
 * 「消したはずの行が画面に出る」**——しかも**その画面だけ**なので気づきにくい。
 * → **開く場所を 1 本にして、条件はここだけに書く**。
 *
 * 🚨 **いまはまだ条件を足していない**（＝ **振る舞いは 1 つも変わらない**）。
 * 既にある表には `deleted_at` がまだ無く、ここで条件を足すと**既存の表が全部空になる**ため。
 * **既存の表へ列を足す手が入った直後に、ここへ 1 行足す。それで全部に効く。**
 *
 * 🚨 **この関数を通らない `trx(collection)` を、検査で止める**
 * （`scripts/check-items-entry.mjs`）。**通らない道が 1 本でも在ると、入口の意味が無い。**
 *
 * 【測った 2026-08-16】この時点で、利用者の表を名指しで開いている箇所は **5 件**。
 * `raw(` で開いている箇所は **0 件**（＝ 文字列で組み立てる抜け道は無い）。
 */
/**
 * 🚨 **利用者が作った表に、ソフトデリートの印を「無ければ足す」**（設問288 A・2026-08-16）。
 *
 * 表の名前は**実行時にしか分からない**ので、migration では書けない。
 * 司令塔の判断で **A（その表を初めて開いたとき）** に走らせる
 * （B の「起動時に全部」は、**開発サーバを全ペインで共有している**ため、
 *  誰かの再起動のたびに全表ぶんの DDL 確認が走る）。
 *
 * 🚨 **半分の表にだけ付いた状態は「正常」**（開いた表から順に付くので、途中の状態が必ず在る）。
 *   だから**入口の条件は「列が在る表だけ」に効かせる**——列が無い表では条件を足さない。
 *
 * 対象の絞り方（司令塔の判断）:
 *   ✅ `directus_collections` に**登録されているもの**
 *      【測った 2026-08-16】利用者側の実表 13 件中、登録なしは `agent_principals` の **1 件**だけ。
 *      🚨 `mcp_allowed_*` / `mcp_forbidden_*` は**登録されている**ので**対象に入る**
 *      （**GUI 作成分と区別が付かない**ため。ソフトデリートは**消さない側**へ倒す変更なので、
 *        余計に含めても壊れない。外して間違えると**消えて戻せない**）。
 *   🚨 **主キーの無い表は対象外**（戻すときに「どの行か」を特定できない。
 *      【測った】`zz_probe_dialog` が該当。ボードの 307 で決まるまで対象外）。
 *
 * 🚨 **失敗を握りつぶさない**。ログに出し、**覚えない**（＝次に開いたときに再試行する）。
 * 🚨 `ADD COLUMN IF NOT EXISTS` なので、**二重に走っても安全**。
 */
export { itemsTable, ensureDeletedAtColumn } from "./table";
import { itemsTable, ensureDeletedAtColumn, hasDeletedAtColumn } from "./table";

export async function listItems(
  actor: Actor,
  collection: string,
  query: ItemsQueryInput,
): Promise<ItemsListResult> {
  await ensureDeletedAtColumn(db, collection);
  const schemaOverview = await getSchemaOverview();
  assertUserCollection(collection, schemaOverview);
  const primaryKey = getPrimaryKey(schemaOverview, collection);
  const permission = await permissionForAction(actor, collection, "read");
  const options = parseQueryOptions(
    queryWithDefaultAllowedFields(query, permission, primaryKey),
  );
  const relations = await loadRelationsIfNeeded(
    collection,
    schemaOverview,
    options,
    permission.rowFilter,
  );
  const relationTargets = collectRelationTargets(
    collection,
    schemaOverview,
    relations,
    options.selection,
    options.filter,
    options.deep,
  );
  const permissionMap = await resolvePermissionMap(actor, relationTargets);
  const filterPermissionMap = rowFilterPermissionMap(permissionMap);

  assertSelectionAllowed(
    collection,
    options.selection,
    options.deep,
    permission.allowedFields,
    schemaOverview,
    relations,
    permissionMap,
  );
  assertFilterAllowed(
    collection,
    options.filter,
    permission.allowedFields,
    schemaOverview,
    relations,
    permissionMap,
  );
  assertSortAllowed(options.sort, permission.allowedFields);

  const rows = (await buildQuery({
    client: db,
    collection,
    schemaOverview,
    relations,
    options,
    extraFilter: permission.rowFilter ?? undefined,
    permissionMap: filterPermissionMap,
  })) as Item[];

  const result: ItemsListResult = {
    data: await itemsWithRelations(
      collection,
      rows,
      options,
      schemaOverview,
      relations,
      permissionMap,
    ),
  };

  if (options.meta.size > 0) {
    result.meta = {};
    if (options.meta.has("total_count")) {
      result.meta.total_count = await countItems({
        client: db,
        collection,
        schemaOverview,
        relations,
        options,
        extraFilter: permission.rowFilter ?? undefined,
        permissionMap: filterPermissionMap,
        filtered: false,
      });
    }
    if (options.meta.has("filter_count")) {
      result.meta.filter_count = await countItems({
        client: db,
        collection,
        schemaOverview,
        relations,
        options,
        extraFilter: permission.rowFilter ?? undefined,
        permissionMap: filterPermissionMap,
        filtered: true,
      });
    }
  }

  return result;
}

export async function getItem(
  actor: Actor,
  collection: string,
  id: string,
  query: ItemsQueryInput = {},
): Promise<Item> {
  await ensureDeletedAtColumn(db, collection);
  const schemaOverview = await getSchemaOverview();
  const columns = assertUserCollection(collection, schemaOverview);
  const primaryKey = getPrimaryKey(schemaOverview, collection);
  assertPrimaryKeyIdMatchesType(
    id,
    columns.find((column) => column.name === primaryKey),
  );
  const permission = await permissionForAction(actor, collection, "read");
  const options = parseQueryOptions({
    ...queryWithDefaultAllowedFields(query, permission, primaryKey),
    limit: "1",
    offset: "0",
  });
  const relations = await loadRelationsIfNeeded(
    collection,
    schemaOverview,
    options,
    permission.rowFilter,
  );
  const relationTargets = collectRelationTargets(
    collection,
    schemaOverview,
    relations,
    options.selection,
    options.filter,
    options.deep,
  );
  const permissionMap = await resolvePermissionMap(actor, relationTargets);

  assertSelectionAllowed(
    collection,
    options.selection,
    options.deep,
    permission.allowedFields,
    schemaOverview,
    relations,
    permissionMap,
  );
  assertFilterAllowed(
    collection,
    options.filter,
    permission.allowedFields,
    schemaOverview,
    relations,
    permissionMap,
  );
  assertSortAllowed(options.sort, permission.allowedFields);

  const selectedColumns = selectedBaseColumns(
    collection,
    schemaOverview,
    relations,
    options.selection,
  );
  const itemQuery = itemsTable(db, collection)
    .select(selectedColumns)
    .where(primaryKey, id);
  if (permission.rowFilter) {
    applyFilter(itemQuery, permission.rowFilter, { collection, schemaOverview, relations });
  }
  const row = (await itemQuery.first()) as Item | undefined;
  if (!row) {
    throwItemNotFound();
  }

  const [item] = await itemsWithRelations(
    collection,
    [row],
    options,
    schemaOverview,
    relations,
    permissionMap,
  );
  return item;
}

function normalizeCreatePayload(body: unknown): Item[] {
  const rows = Array.isArray(body) ? body : [body];
  if (rows.some((row) => !isRecord(row))) {
    throw new ApiError(400, "INVALID_BODY", "bodyはオブジェクトまたはオブジェクト配列で指定してください");
  }
  return rows as Item[];
}

function assertPayloadColumns(
  payload: Item,
  collection: string,
  schemaOverview: SchemaOverview,
): void {
  for (const key of Object.keys(payload)) {
    assertColumnExists(schemaOverview, collection, key);
  }
}

/**
 * **書き換えてはいけない列を、サーバ側で断る**（2026-08-16）。
 *
 * 🚨 **実測で開いていた穴**: `PATCH /api/items/<表>/<id>` に `{"deleted_at": …}` を渡すと
 * **HTTP 200 で通っていた**。＝ 利用者が**任意の行を消せ、戻せ、日付を偽れる**状態だった。
 * `directus_fields` の `readonly: true` は**画面の印**でしかなく、サーバは見ていなかった。
 * `AGENTS.md §3.5`「**権限はフィルタで隠すのでなく、サーバ側で拒否する**」そのもの。
 *
 * 🚨 **画面から隠すと、かえって見つけにくくなる**（画面には出ないが API は通る）。
 * だから**隠す変更と同じ日に**、ここを塞ぐ。
 *
 * 🚨 **黙って落とさない。400 で断る。** 黙って捨てると「消したのに消えない」が起き、
 * 利用者には理由が見えない（storage の files/folders も同じ判断で 400 を返している）。
 *
 * 🚨 **名前で書かない**（`deleted_at` を直接書かない）。判定は `meta.readonly` 1 本。
 * 名前で書くと、次に内部列を足した人がここを直し忘れる。
 *
 * 🚨 **毎回引く**（キャッシュしない）。フィールドの meta は GUI から実行時に変わるので、
 * 覚えると「readonly にしたのに書ける」時間ができる。
 */
function assertPrimaryKeyNotChanged(payload: Item, columns: ColumnInfo[]): void {
  // 🚨 **主キーを更新で書き換えさせない**（2026-08-16・security の指摘で実測して見つけた）。
  //    実測: `PATCH /api/items/<表>/<id>` に `{"id": "<別の uuid>"}` を渡すと **HTTP 200**。
  //    ＝ **行の同一性を、外から変えられた**。他の行を指していた参照・監査ログ・ゴミ箱の
  //    復元先が、すべてずれる。
  //
  // 🚨 **なぜここが空いていたか**（根）: 書き込みの拒否は `directus_fields.readonly` を
  //    引いて判定していたが、**`id` は物理列なのに `directus_fields` に登録が無い**
  //    （実測: 利用者の 15 表・34 列のうち、未登録は **`id` の 5 個だけ**）。
  //    登録が無い列は拒否クエリが**空を返して素通り**する ＝ **allow-by-default** だった。
  //
  // 🚨 **名前で書かない**（`"id"` と書かない）。主キーの列名は表ごとに違いうるので、
  //    **スキーマの `is_primary_key`** で判定する。
  //
  // 🚨 **作成では断らない**。`POST` に `id` を渡すのは正しい使い方
  //    （利用者側で uuid を作って渡す。実測で 201）。禁じるのは**あとから変えること**。
  const 主キー = columns.filter((c) => c.is_primary_key).map((c) => c.name);
  const 当たり = Object.keys(payload).filter((k) => 主キー.includes(k));
  if (当たり.length > 0) {
    throw new ApiError(400, "INVALID_FIELD", `主キーは変更できません: ${当たり.join(", ")}`);
  }
}

async function assertPayloadWritable(payload: Item, collection: string): Promise<void> {
  const keys = Object.keys(payload);
  if (keys.length === 0) return;
  // 🚨 **コード側の一覧が正本**（`INTERNAL_COLUMNS`）。データを書き換えても外れない。
  const 内部 = keys.filter((k) => INTERNAL_COLUMNS.has(k));
  // 🚨 **併せて `meta.readonly` も断る**（利用者が自分で readonly にした列）。
  //    こちらはデータなので、**印を消されたら外れる**——だから内部列はコード側にも置く。
  const 印 = await db("directus_fields")
    .where({ collection, readonly: true })
    .whereIn("field", keys)
    .pluck<string[]>("field");
  const 断る = [...new Set([...内部, ...印])].sort();
  if (断る.length > 0) {
    throw new ApiError(
      400,
      "INVALID_FIELD",
      `変更できないフィールドです: ${断る.join(", ")}`,
    );
  }
}

/**
 * json / jsonb の列に入れる値を、**そのまま渡さず文字列にする**。
 *
 * 🚨 なぜ要るか: **pg は JS の配列を PostgreSQL の配列リテラルとして扱う**（`text[]` 等のため）。
 * その結果 `[1,2,3]` を jsonb 列へ入れると型が合わず、**汎用の 500** になっていた。
 * オブジェクトは pg が JSON として送るので通り、**配列だけが落ちる**という分かりにくい形だった（実測）。
 *
 * 🚨 「配列は保存できない」ではない。**PostgreSQL の jsonb は配列を格納できる**。
 * 渡し方の問題なので、渡し方を直す。
 */
/**
 * DB が投げたエラーを、意味のある 4xx へ翻訳してから投げ直す。
 * 表に無いものはそのまま（原因不明の 500 は 500 のまま出す）。
 */
/**
 * 23505（一意制約違反）が指している**制約名を、列名へ落とす**。
 *
 * 🚨 **PostgreSQL は 23505 で列名を返さない**（実測 2026-08-17: `column` は undefined で、
 *    在るのは `constraint`＝ 制約名だけ）。だから**カタログへ 1 往復して引き直す**。
 * 🚨 **名前で当てない。** `pg_constraint.conname` で行を引き、`conkey`（列番号の配列）から
 *    `pg_attribute` で実際の列名を取る。**綴りの一致に賭けていない**
 *    （`guards-keyed-by-name-break-silently` の形にしない）。
 * 🚨 **引けなければ空を返す**（**推測で欄を作らない**）。欄が無くても応答は今までどおり。
 */
async function columnsOfConstraint(constraint: unknown): Promise<FieldIssue[]> {
  if (typeof constraint !== "string" || constraint === "") return [];
  try {
    const rows = await db
      .select<{ attname: string }[]>("a.attname")
      .from({ c: "pg_constraint" })
      .joinRaw('join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)')
      .where("c.conname", constraint);
    return rows.map((row) => ({ field: row.attname, code: "ALREADY_EXISTS" }));
  } catch {
    // 🚨 引けなかったことを失敗にしない。**欄が言えないだけ**で、元の 409 は返る。
    return [];
  }
}

async function runTranslatingDbErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    // 🚨 23505 のときだけ、制約名から列名を引いて渡す（DB へ 1 往復するので、失敗した時だけ）。
    const code = (error as { code?: unknown } | null)?.code;
    const extra =
      code === "23505" ? await columnsOfConstraint((error as { constraint?: unknown }).constraint) : [];
    rethrowAsConflict(error, extra);
    throw error;
  }
}

function withJsonColumnsSerialized(payload: Item, columns: ColumnInfo[]): Item {
  const jsonColumns = columns.filter(
    (column) => column.data_type === "json" || column.data_type === "jsonb",
  );
  if (jsonColumns.length === 0) return payload;

  const result = { ...payload };
  for (const column of jsonColumns) {
    const value = result[column.name];
    // 文字列は「利用者が自分で JSON を書いた」場合なので触らない。null / undefined もそのまま
    if (value !== null && value !== undefined && typeof value === "object") {
      result[column.name] = JSON.stringify(value);
    }
  }
  return result;
}

function withGeneratedPrimaryKey(
  payload: Item,
  primaryKey: ColumnInfo | undefined,
): Item {
  if (
    primaryKey?.data_type === "uuid" &&
    !Object.hasOwn(payload, primaryKey.name)
  ) {
    return { ...payload, [primaryKey.name]: randomUUID() };
  }
  return payload;
}

async function assertRowsVisibleAfterWrite(
  trx: Knex.Transaction,
  collection: string,
  primaryKey: string,
  rows: Item[],
  permission: PermissionResolution,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
): Promise<void> {
  if (!permission.rowFilter || rows.length === 0) return;

  const ids = rows.map((row) => row[primaryKey]);
  const check = itemsTable(trx, collection);
  whereInValues(check, primaryKey, ids);
  applyFilter(check, permission.rowFilter, { collection, schemaOverview, relations });
  const visible = await check.select(primaryKey);
  if (visible.length !== rows.length) {
    throw new ApiError(403, "PERMISSION_DENIED", "書き込んだ内容が権限の範囲外です");
  }
}

export async function createItems(
  actor: Actor,
  collection: string,
  body: unknown,
  context: ActivityContext,
): Promise<Item | Item[]> {
  await ensureDeletedAtColumn(db, collection);
  const schemaOverview = await getSchemaOverview();
  const columns = assertUserCollection(collection, schemaOverview);
  const permission = await permissionForAction(actor, collection, "create");
  const primaryKeyColumn = columns.find((column) => column.is_primary_key);
  const primaryKey = getPrimaryKey(schemaOverview, collection);
  const relations = permission.rowFilter ? await relationRows() : [];
  const rows = await Promise.all(
    normalizeCreatePayload(body).map(async (payload) => {
      assertPayloadColumns(payload, collection, schemaOverview);
      assertPayloadAllowed(payload, permission.allowedFields);
      await assertPayloadWritable(payload, collection);
      // 🚨 本文は保存前にサーバ側でも落とす（クライアントの検証を当てにしない）
      const safe = await sanitizeRichTextFields(collection, payload);
      return withJsonColumnsSerialized(
        withGeneratedPrimaryKey(safe, primaryKeyColumn),
        columns,
      );
    }),
  );

  // 🚨 DB が弾いた理由を、そのまま汎用の 500 にしない（④ の DDL と同じ手）。
  // 主キーが自動採番でないコレクションに id を省いて作る、型に合わない値を入れる——
  // どれも**利用者の入力の問題**なので 4xx で返す。
  // 🚨 **ゴミ箱の中の行と主キーがぶつかったときは、別の文言にする**（2026-08-16）。
  //    論理削除を入れたので、消した行も**主キーを押さえたまま**になる（それが正しい——
  //    空けると、同じ id で新しい行が作られたあと**ゴミ箱から戻せなくなる**）。
  //    ところが DB は同じ「重複キー」を投げるので、利用者には
  //    🚨 **「もう作られています」と出るのに、画面のどこにも無い**——説明できない状態になる。
  //    toast がラベルで `LABEL_EXISTS_TRASHED` として解いたのと同じ形。
  //
  // 🚨 **入れる前に引かない**（そのぶん問い合わせが増える）。**DB が弾いてから**、
  //    その主キーの行が「消えているだけ」なのかを確かめて、文言を差し替える。
  //    ＝ 競合しない（DB が既に「在る」と言っている）。
  const 消えている行かを見る = async (error: unknown): Promise<never> => {
    const 主キー値 = rows
      .map((row) => (row as Item)[primaryKey])
      .filter((v) => v !== undefined && v !== null);
    if (主キー値.length > 0) {
      // 入口を通さない理由: **消えている行を探すのがここの目的**。
  //   入口（`itemsTable`）は消えた行を隠すので、通すと**必ず 0 件**になり、
  //   「ゴミ箱に在る」を判定できなくなる。
  const ぶつかった = await db(collection)
        .whereIn(primaryKey, 主キー値 as (string | number)[])
        .whereNotNull(DELETED_AT_COLUMN)
        .first();
      if (ぶつかった) {
        throw new ApiError(
          409,
          "ITEM_EXISTS_TRASHED",
          "同じ ID の項目がゴミ箱にあります。戻すか、完全に削除してください",
        );
      }
    }
    throw error;
  };

  const inserted = (await runTranslatingDbErrors(() =>
    db.transaction(async (trx) => {
    if (rows.length === 0) return [];
    const writtenRows = await itemsTable(trx, collection).insert(rows).returning("*");
    await assertRowsVisibleAfterWrite(
      trx,
      collection,
      primaryKey,
      writtenRows as Item[],
      permission,
      schemaOverview,
      relations,
    );
      for (const row of writtenRows as Item[]) {
        await recordActivity(trx, actor, "create", collection, String(row[primaryKey]), context);
      }
      return writtenRows;
    }),
  ).catch(消えている行かを見る)) as Item[];

  const filtered = filterResultFields(inserted, permission.allowedFields) as Item[];
  return Array.isArray(body) ? filtered : filtered[0];
}

export async function updateItem(
  actor: Actor,
  collection: string,
  id: string,
  body: unknown,
  context: ActivityContext,
): Promise<Item> {
  await ensureDeletedAtColumn(db, collection);
  if (!isRecord(body)) {
    throw new ApiError(400, "INVALID_BODY", "JSONオブジェクトを指定してください");
  }
  if (Object.keys(body).length === 0) {
    throw new ApiError(400, "INVALID_BODY", "更新する列を指定してください");
  }

  const schemaOverview = await getSchemaOverview();
  const columns = assertUserCollection(collection, schemaOverview);
  const permission = await permissionForAction(actor, collection, "update");
  assertPayloadColumns(body, collection, schemaOverview);
  assertPayloadAllowed(body, permission.allowedFields);
  assertPrimaryKeyNotChanged(body, columns);
  await assertPayloadWritable(body, collection);
  const primaryKey = getPrimaryKey(schemaOverview, collection);
  assertPrimaryKeyIdMatchesType(
    id,
    columns.find((column) => column.name === primaryKey),
  );
  const relations = permission.rowFilter ? await relationRows() : [];
  // 🚨 本文は保存前にサーバ側でも落とす（クライアントの検証を当てにしない）
  const safeBody = await sanitizeRichTextFields(collection, body);

  const updated = await db.transaction(async (trx) => {
    const updateQuery = itemsTable(trx, collection).where(primaryKey, id);
    if (permission.rowFilter) {
      applyFilter(updateQuery, permission.rowFilter, { collection, schemaOverview, relations });
    }
    const rows = await updateQuery.update(safeBody).returning("*");
    if (rows.length === 0) {
      throwItemNotFound();
    }
    await assertRowsVisibleAfterWrite(
      trx,
      collection,
      primaryKey,
      rows as Item[],
      permission,
      schemaOverview,
      relations,
    );
    await recordActivity(trx, actor, "update", collection, id, context);
    return rows[0] as Item;
  });

  return filterItemFields(updated, permission.allowedFields);
}

export async function deleteItem(
  actor: Actor,
  collection: string,
  id: string,
  context: ActivityContext,
): Promise<void> {
  await ensureDeletedAtColumn(db, collection);
  const schemaOverview = await getSchemaOverview();
  const columns = assertUserCollection(collection, schemaOverview);
  const permission = await permissionForAction(actor, collection, "delete");
  const primaryKey = getPrimaryKey(schemaOverview, collection);
  assertPrimaryKeyIdMatchesType(
    id,
    columns.find((column) => column.name === primaryKey),
  );
  const relations = permission.rowFilter ? await relationRows() : [];

  await db.transaction(async (trx) => {
    const deleteQuery = itemsTable(trx, collection).where(primaryKey, id);
    if (permission.rowFilter) {
      applyFilter(deleteQuery, permission.rowFilter, { collection, schemaOverview, relations });
    }
    // 🚨 **論理削除にする**（設問288 A ③・2026-08-16・司令塔の許可）。
    //    それまでは `ensureDeletedAtColumn` で**列を確保しておきながら物理削除**していた——
    //    ＝ **`deleted_at` を立てるコードが利用者の表に 1 つも無く、ゴミ箱は永遠に 0 件**だった
    //    （**画面は動き、検査も通り、誰も気づかない**形。同じ形が同じ日に 3 か所で見つかった）。
    //
    // 🚨 `deleteQuery` は `itemsTable()` から作っているので、**既に消した行は当たらない**。
    //    ＝ **2 回目の削除は 0 行 → 404**。これは正しい（消したものは、もう消せない）。
    //
    // 🚨 **列が無い表は物理削除のまま**にする。列は「登録が在り、主キーが在る表」にしか付かず
    //    （`ensureDeletedAtColumn`）、**無い表で `update({deleted_at})` を投げると必ず落ちる**。
    //    黙って落とすより、**消えるほうがまだ説明が付く**。ただし**黙って分岐しない**——ログに出す。
    const 論理削除できる = hasDeletedAtColumn(collection);
    if (!論理削除できる) {
      console.warn(
        `[items] ${collection} に ${DELETED_AT_COLUMN} 列が無いため物理削除します`
        + `（ゴミ箱に入りません。登録か主キーが無い表です）`,
      );
    }
    const deleted = 論理削除できる
      ? await deleteQuery.update({ [DELETED_AT_COLUMN]: trx.fn.now() })
      : await deleteQuery.delete();
    if (deleted === 0) {
      throwItemNotFound();
    }
    await recordActivity(trx, actor, "delete", collection, id, context);
  });
}
