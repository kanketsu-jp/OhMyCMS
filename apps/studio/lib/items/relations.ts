import { ApiError } from "@/lib/schema/errors";
import type { ColumnInfo, RelationMeta } from "@/lib/schema/models";
import { assertSafeIdentifier } from "@/lib/schema/validate";

export type SchemaOverview = Record<string, ColumnInfo[]>;

export type ResolvedRelation =
  | {
      kind: "m2o";
      field: string;
      sourceCollection: string;
      sourceColumn: string;
      targetCollection: string;
      targetColumn: string;
    }
  | {
      kind: "o2m";
      field: string;
      sourceCollection: string;
      sourceColumn: string;
      targetCollection: string;
      targetColumn: string;
    };

export function columnsFor(
  schemaOverview: SchemaOverview,
  collection: string,
): ColumnInfo[] {
  return schemaOverview[collection] ?? [];
}

export function columnMapFor(
  schemaOverview: SchemaOverview,
  collection: string,
): Map<string, ColumnInfo> {
  return new Map(columnsFor(schemaOverview, collection).map((column) => [column.name, column]));
}

export function getPrimaryKey(
  schemaOverview: SchemaOverview,
  collection: string,
): string {
  const primaryKey = columnsFor(schemaOverview, collection).find(
    (column) => column.is_primary_key,
  );
  if (!primaryKey) {
    throw new ApiError(400, "PRIMARY_KEY_NOT_FOUND", "主キーが見つかりません");
  }
  return primaryKey.name;
}

export function assertColumnExists(
  schemaOverview: SchemaOverview,
  collection: string,
  field: string,
): ColumnInfo {
  assertSafeIdentifier(field);
  const column = columnMapFor(schemaOverview, collection).get(field);
  if (!column) {
    throw new ApiError(400, "UNKNOWN_FIELD", `存在しない列です: ${field}`);
  }
  return column;
}

export function resolveRelation(
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  collection: string,
  field: string,
): ResolvedRelation | null {
  assertSafeIdentifier(field);

  const column = columnMapFor(schemaOverview, collection).get(field);
  if (column?.foreign_key_table && column.foreign_key_column) {
    return {
      kind: "m2o",
      field,
      sourceCollection: collection,
      sourceColumn: field,
      targetCollection: column.foreign_key_table,
      targetColumn: column.foreign_key_column,
    };
  }

  const m2oMeta = relations.find(
    (relation) =>
      relation.many_collection === collection && relation.many_field === field,
  );
  if (m2oMeta) {
    if (m2oMeta.junction_field || m2oMeta.one_collection_field) {
      throw new ApiError(
        400,
        "UNSUPPORTED_RELATION",
        "MVPではm2m/m2aリレーションに対応していません",
      );
    }
    if (m2oMeta.one_collection && m2oMeta.one_primary) {
      return {
        kind: "m2o",
        field,
        sourceCollection: collection,
        sourceColumn: m2oMeta.many_field,
        targetCollection: m2oMeta.one_collection,
        targetColumn: m2oMeta.one_primary,
      };
    }
  }

  const o2mMeta = relations.find(
    (relation) =>
      relation.one_collection === collection && relation.one_field === field,
  );
  if (o2mMeta) {
    if (o2mMeta.junction_field || o2mMeta.one_collection_field) {
      throw new ApiError(
        400,
        "UNSUPPORTED_RELATION",
        "MVPではm2m/m2aリレーションに対応していません",
      );
    }
    return {
      kind: "o2m",
      field,
      sourceCollection: collection,
      sourceColumn: o2mMeta.one_primary ?? getPrimaryKey(schemaOverview, collection),
      targetCollection: o2mMeta.many_collection,
      targetColumn: o2mMeta.many_field,
    };
  }

  return null;
}

export function isManyToOneColumn(
  schemaOverview: SchemaOverview,
  collection: string,
  field: string,
): boolean {
  const column = columnMapFor(schemaOverview, collection).get(field);
  return Boolean(column?.foreign_key_table && column.foreign_key_column);
}
