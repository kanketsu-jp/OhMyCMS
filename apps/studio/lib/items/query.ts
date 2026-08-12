import type { Knex } from "knex";
import { ApiError } from "@/lib/schema/errors";
import type { RelationMeta } from "@/lib/schema/models";
import { assertSafeIdentifier } from "@/lib/schema/validate";
import { applyFilter, type FilterObject } from "./filter";
import {
  assertColumnExists,
  columnsFor,
  isManyToOneColumn,
  resolveRelation,
  type SchemaOverview,
} from "./relations";

export type ItemsQueryInput = {
  fields?: string | null;
  filter?: string | null;
  sort?: string | null;
  limit?: string | null;
  offset?: string | null;
  page?: string | null;
  meta?: string | null;
  deep?: string | null;
};

export type FieldSelection = {
  includeAllScalars: boolean;
  scalarFields: Set<string>;
  relations: Map<string, FieldSelection>;
};

export type SortSpec = {
  field: string;
  direction: "asc" | "desc";
};

export type DeepOptions = Record<string, unknown>;

export type ParsedQueryOptions = {
  selection: FieldSelection;
  filter?: FilterObject;
  sort: SortSpec[];
  limit: number;
  offset: number;
  meta: Set<"total_count" | "filter_count">;
  deep: DeepOptions;
};

export type BuildQueryArgs = {
  client: Knex | Knex.Transaction;
  collection: string;
  schemaOverview: SchemaOverview;
  relations: RelationMeta[];
  options: ParsedQueryOptions;
  extraFilter?: FilterObject;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const UNLIMITED_CAP = 10000;

function createSelection(includeAllScalars = false): FieldSelection {
  return {
    includeAllScalars,
    scalarFields: new Set(),
    relations: new Map(),
  };
}

function parseJsonObject(value: string | null | undefined, name: string): FilterObject | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not object");
    }
    return parsed as FilterObject;
  } catch {
    throw new ApiError(400, `INVALID_${name.toUpperCase()}`, `${name}はJSONオブジェクトで指定してください`);
  }
}

function parseInteger(
  value: string | null | undefined,
  name: string,
  defaultValue: number,
): number {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ApiError(400, `INVALID_${name.toUpperCase()}`, `${name}は整数で指定してください`);
  }
  return parsed;
}

function parseLimit(value: string | null | undefined): number {
  const limit = parseInteger(value, "limit", DEFAULT_LIMIT);
  if (limit === -1) return UNLIMITED_CAP;
  if (limit < 0) {
    throw new ApiError(400, "INVALID_LIMIT", "limitは0以上、または-1で指定してください");
  }
  if (limit > MAX_LIMIT) {
    throw new ApiError(400, "INVALID_LIMIT", `limitは最大${MAX_LIMIT}です`);
  }
  return limit;
}

function parseOffset(value: string | null | undefined): number {
  const offset = parseInteger(value, "offset", 0);
  if (offset < 0) {
    throw new ApiError(400, "INVALID_OFFSET", "offsetは0以上で指定してください");
  }
  return offset;
}

function parseMeta(value: string | null | undefined): Set<"total_count" | "filter_count"> {
  const result = new Set<"total_count" | "filter_count">();
  if (!value) return result;

  for (const item of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (item !== "total_count" && item !== "filter_count") {
      throw new ApiError(400, "INVALID_META", `未対応のmetaです: ${item}`);
    }
    result.add(item);
  }
  return result;
}

function parseSort(value: string | null | undefined): SortSpec[] {
  if (!value) return [];

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const direction = part.startsWith("-") ? "desc" : "asc";
      const field = direction === "desc" ? part.slice(1) : part;
      if (field.includes(".")) {
        throw new ApiError(400, "INVALID_SORT", "sortは実列のみ指定できます");
      }
      assertSafeIdentifier(field);
      return { field, direction };
    });
}

function parseFields(value: string | null | undefined): FieldSelection {
  if (!value) return createSelection(true);

  const selection = createSelection(false);
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return createSelection(true);

  for (const part of parts) {
    const path = part.split(".");
    for (const segment of path) {
      if (segment !== "*") assertSafeIdentifier(segment);
    }

    if (path.length === 1) {
      if (path[0] === "*") selection.includeAllScalars = true;
      else selection.scalarFields.add(path[0]);
      continue;
    }

    let cursor = selection;
    for (const [index, segment] of path.entries()) {
      const isLast = index === path.length - 1;
      if (isLast) {
        if (segment === "*") cursor.includeAllScalars = true;
        else cursor.scalarFields.add(segment);
      } else {
        if (segment === "*") {
          throw new ApiError(400, "INVALID_FIELDS", "*はパス末尾で指定してください");
        }
        const child = cursor.relations.get(segment) ?? createSelection(false);
        cursor.relations.set(segment, child);
        cursor = child;
      }
    }
  }

  return selection;
}

function relationNamesFromFilter(filter: unknown, names = new Set<string>()): Set<string> {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return names;
  for (const [key, value] of Object.entries(filter as Record<string, unknown>)) {
    if (key === "_and" || key === "_or") {
      if (Array.isArray(value)) {
        for (const child of value) relationNamesFromFilter(child, names);
      }
      continue;
    }
    if (!key.startsWith("_") && value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      if (!Object.keys(nested).some((nestedKey) => nestedKey.startsWith("_"))) {
        names.add(key);
      }
    }
  }
  return names;
}

export function needsRelationMetadata(
  collection: string,
  schemaOverview: SchemaOverview,
  selection: FieldSelection,
  filter?: FilterObject,
): boolean {
  const names = new Set([...selection.relations.keys()]);
  for (const name of relationNamesFromFilter(filter)) names.add(name);

  for (const name of names) {
    if (!isManyToOneColumn(schemaOverview, collection, name)) return true;
  }
  return false;
}

export function parseQueryOptions(input: ItemsQueryInput): ParsedQueryOptions {
  const limit = parseLimit(input.limit);
  const page = parseInteger(input.page, "page", 0);
  if (page < 0) {
    throw new ApiError(400, "INVALID_PAGE", "pageは1以上で指定してください");
  }

  return {
    selection: parseFields(input.fields),
    filter: parseJsonObject(input.filter, "filter"),
    sort: parseSort(input.sort),
    limit,
    offset: page > 0 ? (page - 1) * limit : parseOffset(input.offset),
    meta: parseMeta(input.meta),
    deep: parseJsonObject(input.deep, "deep") ?? {},
  };
}

export function selectedBaseColumns(
  collection: string,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  selection: FieldSelection,
): string[] {
  const columns = columnsFor(schemaOverview, collection);
  const selected = new Set<string>();

  if (selection.includeAllScalars) {
    for (const column of columns) selected.add(column.name);
  } else {
    for (const field of selection.scalarFields) {
      assertColumnExists(schemaOverview, collection, field);
      selected.add(field);
    }
  }

  for (const relationField of selection.relations.keys()) {
    const relation = resolveRelation(schemaOverview, relations, collection, relationField);
    if (!relation) {
      throw new ApiError(400, "UNKNOWN_RELATION", `存在しないリレーションです: ${relationField}`);
    }
    if (relation.kind === "m2o") selected.add(relation.sourceColumn);
    else selected.add(relation.sourceColumn);
  }

  if (selected.size === 0) {
    const primary = columns.find((column) => column.is_primary_key);
    if (primary) selected.add(primary.name);
  }

  return Array.from(selected);
}

export function applyValidatedSort(
  builder: Knex.QueryBuilder,
  collection: string,
  schemaOverview: SchemaOverview,
  sort: SortSpec[],
): void {
  for (const spec of sort) {
    assertColumnExists(schemaOverview, collection, spec.field);
    builder.orderBy(spec.field, spec.direction);
  }
}

export function buildQuery({
  client,
  collection,
  schemaOverview,
  relations,
  options,
  extraFilter,
}: BuildQueryArgs): Knex.QueryBuilder {
  const selectedColumns = selectedBaseColumns(
    collection,
    schemaOverview,
    relations,
    options.selection,
  );
  const query = client(collection).select(selectedColumns);

  if (options.filter) {
    applyFilter(query, options.filter, { collection, schemaOverview, relations });
  }
  if (extraFilter) {
    applyFilter(query, extraFilter, { collection, schemaOverview, relations });
  }

  applyValidatedSort(query, collection, schemaOverview, options.sort);
  query.limit(options.limit).offset(options.offset);
  return query;
}

export async function countItems({
  client,
  collection,
  schemaOverview,
  relations,
  options,
  extraFilter,
  filtered,
}: BuildQueryArgs & { filtered: boolean }): Promise<number> {
  const query = client(collection).count<{ count: string }[]>({ count: "*" });

  if (filtered && options.filter) {
    applyFilter(query, options.filter, { collection, schemaOverview, relations });
  }
  if (extraFilter) {
    applyFilter(query, extraFilter, { collection, schemaOverview, relations });
  }

  const row = await query.first();
  return Number(row?.count ?? 0);
}
