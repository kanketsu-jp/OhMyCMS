import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import {
  resolvePermission,
  type PermissionAction,
  type PermissionResolution,
} from "@/lib/permissions/resolve";
import { ApiError } from "@/lib/schema/errors";
import { getSchemaOverview } from "@/lib/schema/introspect";
import type { ColumnInfo, RelationMeta } from "@/lib/schema/models";
import { assertSafeIdentifier, isSystemTableName } from "@/lib/schema/validate";
import { applyFilter, type FilterObject } from "./filter";
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
  selection: FieldSelection,
  allowedFields: PermissionResolution["allowedFields"],
): void {
  if (allowedFields === "*") return;
  if (selection.includeAllScalars) {
    throw new ApiError(403, "FIELD_FORBIDDEN", "許可されていないフィールドが含まれています");
  }

  for (const field of selection.scalarFields) {
    assertFieldAllowed(allowedFields, field);
  }
  for (const field of selection.relations.keys()) {
    assertFieldAllowed(allowedFields, field);
  }
}

function hasOperatorKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => key.startsWith("_"));
}

function assertFilterAllowed(
  filter: unknown,
  allowedFields: PermissionResolution["allowedFields"],
): void {
  if (allowedFields === "*" || filter === undefined || filter === null) return;
  if (!isRecord(filter)) return;

  for (const [key, value] of Object.entries(filter)) {
    if (key === "_and" || key === "_or") {
      if (Array.isArray(value)) {
        for (const child of value) assertFilterAllowed(child, allowedFields);
      }
      continue;
    }
    if (key.startsWith("_")) continue;

    assertFieldAllowed(allowedFields, key);
    if (isRecord(value) && !hasOperatorKeys(value)) {
      assertFilterAllowed(value, allowedFields);
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
): Promise<void> {
  if (items.length === 0 || selection.relations.size === 0) return;

  for (const [field, childSelection] of selection.relations.entries()) {
    const relation = resolveRelation(schemaOverview, relations, collection, field);
    if (!relation) {
      throw new ApiError(400, "UNKNOWN_RELATION", `存在しないリレーションです: ${field}`);
    }

    const childDeep = relationDeepOptions(deep, field);
    const childFilter = parseDeepFilter(childDeep);
    const childSort = parseDeepSort(childDeep);

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
      const query = db(relation.targetCollection)
        .select(selectedColumns)
      whereInValues(query, relation.targetColumn, keys);
      if (childFilter) {
        applyFilter(query, childFilter, {
          collection: relation.targetCollection,
          schemaOverview,
          relations,
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
    const query = db(relation.targetCollection)
      .select(selectedColumns)
    whereInValues(query, relation.targetColumn, keys);
    if (childFilter) {
      applyFilter(query, childFilter, {
        collection: relation.targetCollection,
        schemaOverview,
        relations,
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
): Promise<Item[]> {
  await resolveRelationsForItems(
    rows,
    collection,
    options.selection,
    options.deep,
    schemaOverview,
    relations,
  );
  return rows.map((row) => projectItem(row, collection, schemaOverview, options.selection));
}

export async function listItems(
  actor: Actor,
  collection: string,
  query: ItemsQueryInput,
): Promise<ItemsListResult> {
  const schemaOverview = await getSchemaOverview();
  assertUserCollection(collection, schemaOverview);
  const primaryKey = getPrimaryKey(schemaOverview, collection);
  const permission = await permissionForAction(actor, collection, "read");
  const options = parseQueryOptions(
    queryWithDefaultAllowedFields(query, permission, primaryKey),
  );
  assertSelectionAllowed(options.selection, permission.allowedFields);
  assertFilterAllowed(options.filter, permission.allowedFields);
  assertSortAllowed(options.sort, permission.allowedFields);
  const relations = await loadRelationsIfNeeded(
    collection,
    schemaOverview,
    options,
    permission.rowFilter,
  );

  const rows = (await buildQuery({
    client: db,
    collection,
    schemaOverview,
    relations,
    options,
    extraFilter: permission.rowFilter ?? undefined,
  })) as Item[];

  const result: ItemsListResult = {
    data: await itemsWithRelations(collection, rows, options, schemaOverview, relations),
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
  const schemaOverview = await getSchemaOverview();
  assertUserCollection(collection, schemaOverview);
  const primaryKey = getPrimaryKey(schemaOverview, collection);
  const permission = await permissionForAction(actor, collection, "read");
  const options = parseQueryOptions({
    ...queryWithDefaultAllowedFields(query, permission, primaryKey),
    limit: "1",
    offset: "0",
  });
  assertSelectionAllowed(options.selection, permission.allowedFields);
  assertFilterAllowed(options.filter, permission.allowedFields);
  assertSortAllowed(options.sort, permission.allowedFields);
  const relations = await loadRelationsIfNeeded(
    collection,
    schemaOverview,
    options,
    permission.rowFilter,
  );

  const selectedColumns = selectedBaseColumns(
    collection,
    schemaOverview,
    relations,
    options.selection,
  );
  const itemQuery = db(collection)
    .select(selectedColumns)
    .where(primaryKey, id);
  if (permission.rowFilter) {
    applyFilter(itemQuery, permission.rowFilter, { collection, schemaOverview, relations });
  }
  const row = (await itemQuery.first()) as Item | undefined;
  if (!row) {
    throw new ApiError(404, "ITEM_NOT_FOUND", "アイテムが見つかりません");
  }

  const [item] = await itemsWithRelations(collection, [row], options, schemaOverview, relations);
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

export async function createItems(
  actor: Actor,
  collection: string,
  body: unknown,
): Promise<Item | Item[]> {
  const schemaOverview = await getSchemaOverview();
  const columns = assertUserCollection(collection, schemaOverview);
  const permission = await permissionForAction(actor, collection, "create");
  const primaryKey = columns.find((column) => column.is_primary_key);
  const rows = normalizeCreatePayload(body).map((payload) => {
    assertPayloadColumns(payload, collection, schemaOverview);
    assertPayloadAllowed(payload, permission.allowedFields);
    return withGeneratedPrimaryKey(payload, primaryKey);
  });

  const inserted = await db.transaction(async (trx) => {
    if (rows.length === 0) return [];
    return trx(collection).insert(rows).returning("*");
  }) as Item[];

  const filtered = filterResultFields(inserted, permission.allowedFields) as Item[];
  return Array.isArray(body) ? filtered : filtered[0];
}

export async function updateItem(
  actor: Actor,
  collection: string,
  id: string,
  body: unknown,
): Promise<Item> {
  if (!isRecord(body)) {
    throw new ApiError(400, "INVALID_BODY", "JSONオブジェクトを指定してください");
  }
  if (Object.keys(body).length === 0) {
    throw new ApiError(400, "INVALID_BODY", "更新する列を指定してください");
  }

  const schemaOverview = await getSchemaOverview();
  assertUserCollection(collection, schemaOverview);
  const permission = await permissionForAction(actor, collection, "update");
  assertPayloadColumns(body, collection, schemaOverview);
  assertPayloadAllowed(body, permission.allowedFields);
  const primaryKey = getPrimaryKey(schemaOverview, collection);
  const relations = permission.rowFilter ? await relationRows() : [];

  const updated = await db.transaction(async (trx) => {
    const updateQuery = trx(collection).where(primaryKey, id);
    if (permission.rowFilter) {
      applyFilter(updateQuery, permission.rowFilter, { collection, schemaOverview, relations });
    }
    const rows = await updateQuery.update(body).returning("*");
    if (rows.length === 0) {
      throw new ApiError(404, "ITEM_NOT_FOUND", "アイテムが見つかりません");
    }
    return rows[0] as Item;
  });

  return filterItemFields(updated, permission.allowedFields);
}

export async function deleteItem(
  actor: Actor,
  collection: string,
  id: string,
): Promise<void> {
  const schemaOverview = await getSchemaOverview();
  assertUserCollection(collection, schemaOverview);
  const permission = await permissionForAction(actor, collection, "delete");
  const primaryKey = getPrimaryKey(schemaOverview, collection);
  const relations = permission.rowFilter ? await relationRows() : [];

  await db.transaction(async (trx) => {
    const deleteQuery = trx(collection).where(primaryKey, id);
    if (permission.rowFilter) {
      applyFilter(deleteQuery, permission.rowFilter, { collection, schemaOverview, relations });
    }
    const deleted = await deleteQuery.delete();
    if (deleted === 0) {
      throw new ApiError(404, "ITEM_NOT_FOUND", "アイテムが見つかりません");
    }
  });
}
