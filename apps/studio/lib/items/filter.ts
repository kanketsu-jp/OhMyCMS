import type { Knex } from "knex";
import { ApiError } from "@/lib/schema/errors";
import type { RelationMeta } from "@/lib/schema/models";
import {
  assertColumnExists,
  resolveRelation,
  type SchemaOverview,
} from "./relations";

export type FilterObject = Record<string, unknown>;

export type FilterContext = {
  collection: string;
  schemaOverview: SchemaOverview;
  relations: RelationMeta[];
};

type ItemQueryBuilder = Knex.QueryBuilder<Record<string, unknown>, unknown[]>;

const OPERATORS = new Set([
  "_eq",
  "_neq",
  "_lt",
  "_lte",
  "_gt",
  "_gte",
  "_in",
  "_nin",
  "_null",
  "_nnull",
  "_contains",
  "_ncontains",
  "_icontains",
  "_starts_with",
  "_ends_with",
  "_between",
  "_nbetween",
  "_empty",
  "_nempty",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOperatorKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => key.startsWith("_"));
}

function addGroupedWhere(
  builder: ItemQueryBuilder,
  booleanOperator: "and" | "or",
  callback: (group: ItemQueryBuilder) => void,
): void {
  if (booleanOperator === "or") {
    builder.orWhere(function grouped() {
      callback(this as ItemQueryBuilder);
    });
  } else {
    builder.where(function grouped() {
      callback(this as ItemQueryBuilder);
    });
  }
}

function addWhere(
  builder: ItemQueryBuilder,
  booleanOperator: "and" | "or",
  column: string,
  operator: string,
  value: unknown,
): void {
  const bindings: Knex.RawBinding[] = [column, value as Knex.RawBinding];
  if (booleanOperator === "or") {
    builder.orWhereRaw(`?? ${operator} ?`, bindings);
  } else {
    builder.whereRaw(`?? ${operator} ?`, bindings);
  }
}

function addWhereNull(
  builder: ItemQueryBuilder,
  booleanOperator: "and" | "or",
  column: string,
  negate: boolean,
): void {
  if (booleanOperator === "or") {
    if (negate) builder.orWhereNotNull(column);
    else builder.orWhereNull(column);
  } else {
    if (negate) builder.whereNotNull(column);
    else builder.whereNull(column);
  }
}

function addWhereIn(
  builder: ItemQueryBuilder,
  booleanOperator: "and" | "or",
  column: string,
  values: readonly unknown[],
  negate: boolean,
): void {
  const inBuilder = builder as unknown as {
    orWhereNotIn: (field: string, items: readonly unknown[]) => void;
    orWhereIn: (field: string, items: readonly unknown[]) => void;
    whereNotIn: (field: string, items: readonly unknown[]) => void;
    whereIn: (field: string, items: readonly unknown[]) => void;
  };
  if (booleanOperator === "or") {
    if (negate) inBuilder.orWhereNotIn(column, values);
    else inBuilder.orWhereIn(column, values);
  } else {
    if (negate) inBuilder.whereNotIn(column, values);
    else inBuilder.whereIn(column, values);
  }
}

function asBoolean(value: unknown, operator: string): boolean {
  if (typeof value !== "boolean") {
    throw new ApiError(400, "INVALID_FILTER", `${operator}は真偽値で指定してください`);
  }
  return value;
}

function asArray(value: unknown, operator: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  throw new ApiError(400, "INVALID_FILTER", `${operator}は配列またはカンマ区切り文字列で指定してください`);
}

function asBetween(value: unknown, operator: string): [unknown, unknown] {
  if (Array.isArray(value) && value.length === 2) {
    return [value[0], value[1]];
  }
  throw new ApiError(400, "INVALID_FILTER", `${operator}は2要素の配列で指定してください`);
}

function applyOperator(
  builder: ItemQueryBuilder,
  column: string,
  operator: string,
  value: unknown,
  booleanOperator: "and" | "or",
): void {
  if (!OPERATORS.has(operator)) {
    throw new ApiError(400, "UNSUPPORTED_OPERATOR", `未対応の演算子です: ${operator}`);
  }

  switch (operator) {
    case "_eq":
      addWhere(builder, booleanOperator, column, "=", value);
      return;
    case "_neq":
      addWhere(builder, booleanOperator, column, "<>", value);
      return;
    case "_lt":
      addWhere(builder, booleanOperator, column, "<", value);
      return;
    case "_lte":
      addWhere(builder, booleanOperator, column, "<=", value);
      return;
    case "_gt":
      addWhere(builder, booleanOperator, column, ">", value);
      return;
    case "_gte":
      addWhere(builder, booleanOperator, column, ">=", value);
      return;
    case "_in":
      addWhereIn(builder, booleanOperator, column, asArray(value, operator), false);
      return;
    case "_nin":
      addWhereIn(builder, booleanOperator, column, asArray(value, operator), true);
      return;
    case "_null":
      if (asBoolean(value, operator)) addWhereNull(builder, booleanOperator, column, false);
      else addWhereNull(builder, booleanOperator, column, true);
      return;
    case "_nnull":
      if (asBoolean(value, operator)) addWhereNull(builder, booleanOperator, column, true);
      else addWhereNull(builder, booleanOperator, column, false);
      return;
    case "_contains":
      addWhere(builder, booleanOperator, column, "like", `%${String(value)}%`);
      return;
    case "_ncontains":
      addGroupedWhere(builder, booleanOperator, (group) => {
        group
          .whereNull(column)
          .orWhereRaw("?? not like ?", [column, `%${String(value)}%`]);
      });
      return;
    case "_icontains":
      addWhere(builder, booleanOperator, column, "ilike", `%${String(value)}%`);
      return;
    case "_starts_with":
      addWhere(builder, booleanOperator, column, "like", `${String(value)}%`);
      return;
    case "_ends_with":
      addWhere(builder, booleanOperator, column, "like", `%${String(value)}`);
      return;
    case "_between": {
      const [start, end] = asBetween(value, operator);
      addGroupedWhere(builder, booleanOperator, (group) => {
        group
          .whereRaw("?? >= ?", [column, start as Knex.RawBinding])
          .whereRaw("?? <= ?", [column, end as Knex.RawBinding]);
      });
      return;
    }
    case "_nbetween": {
      const [start, end] = asBetween(value, operator);
      addGroupedWhere(builder, booleanOperator, (group) => {
        group
          .whereRaw("?? < ?", [column, start as Knex.RawBinding])
          .orWhereRaw("?? > ?", [column, end as Knex.RawBinding]);
      });
      return;
    }
    case "_empty":
      if (asBoolean(value, operator)) {
        addGroupedWhere(builder, booleanOperator, (group) => {
          group.whereNull(column).orWhereRaw("?? = ?", [column, ""]);
        });
      } else {
        addGroupedWhere(builder, booleanOperator, (group) => {
          group.whereNotNull(column).whereRaw("?? <> ?", [column, ""]);
        });
      }
      return;
    case "_nempty":
      if (asBoolean(value, operator)) {
        addGroupedWhere(builder, booleanOperator, (group) => {
          group.whereNotNull(column).whereRaw("?? <> ?", [column, ""]);
        });
      } else {
        addGroupedWhere(builder, booleanOperator, (group) => {
          group.whereNull(column).orWhereRaw("?? = ?", [column, ""]);
        });
      }
      return;
  }
}

function applyRelationFilter(
  builder: ItemQueryBuilder,
  field: string,
  value: Record<string, unknown>,
  ctx: FilterContext,
  booleanOperator: "and" | "or",
): void {
  const relation = resolveRelation(ctx.schemaOverview, ctx.relations, ctx.collection, field);
  if (!relation) {
    throw new ApiError(400, "UNKNOWN_FIELD", `存在しない列です: ${field}`);
  }

  if (relation.kind === "m2o") {
    addGroupedWhere(builder, booleanOperator, (group) => {
      group.whereIn(relation.sourceColumn, function relatedFilter(this: ItemQueryBuilder) {
        this.select(relation.targetColumn).from(relation.targetCollection);
        applyFilter(this, value, {
          ...ctx,
          collection: relation.targetCollection,
        });
      });
    });
    return;
  }

  addGroupedWhere(builder, booleanOperator, (group) => {
    group.whereIn(relation.sourceColumn, function relatedFilter(this: ItemQueryBuilder) {
      this.select(relation.targetColumn).from(relation.targetCollection);
      applyFilter(this, value, {
        ...ctx,
        collection: relation.targetCollection,
      });
    });
  });
}

function applyFieldFilter(
  builder: ItemQueryBuilder,
  field: string,
  value: unknown,
  ctx: FilterContext,
  booleanOperator: "and" | "or",
): void {
  assertColumnExists(ctx.schemaOverview, ctx.collection, field);

  if (isRecord(value)) {
    for (const [operator, operatorValue] of Object.entries(value)) {
      applyOperator(builder, field, operator, operatorValue, booleanOperator);
    }
    return;
  }

  applyOperator(builder, field, "_eq", value, booleanOperator);
}

export function applyFilter(
  builder: ItemQueryBuilder,
  filter: unknown,
  ctx: FilterContext,
  booleanOperator: "and" | "or" = "and",
): void {
  if (filter === undefined || filter === null) return;
  if (!isRecord(filter)) {
    throw new ApiError(400, "INVALID_FILTER", "filterはJSONオブジェクトで指定してください");
  }

  for (const [key, value] of Object.entries(filter)) {
    if (key === "_and" || key === "_or") {
      if (!Array.isArray(value)) {
        throw new ApiError(400, "INVALID_FILTER", `${key}は配列で指定してください`);
      }
      const nestedBoolean = key === "_or" ? "or" : "and";
      addGroupedWhere(builder, booleanOperator, (group) => {
        for (const child of value) {
          applyFilter(group, child, ctx, nestedBoolean);
        }
      });
      continue;
    }

    if (key.startsWith("_")) {
      throw new ApiError(400, "UNSUPPORTED_OPERATOR", `未対応の論理演算子です: ${key}`);
    }

    if (isRecord(value) && !hasOperatorKeys(value)) {
      applyRelationFilter(builder, key, value, ctx, booleanOperator);
    } else {
      applyFieldFilter(builder, key, value, ctx, booleanOperator);
    }
  }
}
