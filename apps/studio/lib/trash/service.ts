import type { Knex } from "knex";
import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { applyFilter } from "@/lib/items/filter";
import { resolvePermission, type PermissionAction } from "@/lib/permissions/resolve";
import { ApiError } from "@/lib/schema/errors";
import { getSchemaOverview } from "@/lib/schema/introspect";
import type { ColumnInfo, RelationMeta } from "@/lib/schema/models";
import { assertSafeIdentifier } from "@/lib/schema/validate";

// 設定化は別作業。決定は knowledge/decisions/trash-and-restore-ui.md §4
export const TRASH_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const DISPLAY_FIELDS = [
  "title",
  "name",
  "filename_download",
  "email",
  "collection",
  "field",
  "id",
];

type PrimaryKeyMap = Record<string, string>;
type SourceKind = "collection" | "files" | "folders" | "labels" | "label_assignments" | "activity";
type RestoreMode = "with_related" | "only";

type TableMeta = {
  collection: string;
  columns: ColumnInfo[];
  primaryKeys: string[];
  sourceKind: SourceKind;
  sourceLabel: string | null;
};

type TrashKey = {
  collection: string;
  primaryKey: PrimaryKeyMap | null;
};

type ReferenceIssue = {
  column: string;
  targetCollection: string;
  targetLabel: string;
  value: string;
  state: "trashed" | "missing";
};

export type TrashItem = {
  key: string;
  collection: string;
  displayName: string;
  sourceKind: SourceKind;
  sourceLabel: string | null;
  deletedAt: string;
  daysRemaining: number;
  canRestore: boolean;
  disabledReason: "missing_primary_key" | null;
};

export type TrashRestorePlan = {
  key: string;
  displayName: string;
  requiresConfirmation: boolean;
  trashedReferences: ReferenceIssue[];
  missingReferences: ReferenceIssue[];
  relatedRestoreCount: number;
};

function encodeKey(value: TrashKey): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeKey(key: string): TrashKey {
  try {
    const parsed = JSON.parse(Buffer.from(key, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid key");
    }
    const collection = (parsed as { collection?: unknown }).collection;
    const primaryKey = (parsed as { primaryKey?: unknown }).primaryKey;
    if (typeof collection !== "string") throw new Error("invalid collection");
    if (primaryKey !== null && (!primaryKey || typeof primaryKey !== "object" || Array.isArray(primaryKey))) {
      throw new Error("invalid primary key");
    }
    return { collection, primaryKey: primaryKey as PrimaryKeyMap | null };
  } catch {
    throw new ApiError(400, "INVALID_TRASH_KEY", "ゴミ箱の項目指定が不正です");
  }
}

function sourceKindFor(collection: string): SourceKind {
  switch (collection) {
    case "directus_files":
      return "files";
    case "directus_folders":
      return "folders";
    case "ohmycms_labels":
      return "labels";
    case "ohmycms_label_assignments":
      return "label_assignments";
    case "directus_activity":
      return "activity";
    default:
      return "collection";
  }
}

function permissionCollection(collection: string): string {
  if (collection === "ohmycms_labels" || collection === "ohmycms_label_assignments") {
    return "directus_files";
  }
  return collection;
}

function canApplyRowFilter(collection: string): boolean {
  return permissionCollection(collection) === collection;
}

async function relationRows(): Promise<RelationMeta[]> {
  return db<RelationMeta>("directus_relations").select("*");
}

async function primaryKeysByTable(): Promise<Map<string, string[]>> {
  const result = await db.raw<{ rows: { table_name: string; column_name: string }[] }>(
    `
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
       AND kcu.table_name = tc.table_name
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position
    `,
  );
  const map = new Map<string, string[]>();
  for (const row of result.rows) {
    const current = map.get(row.table_name) ?? [];
    current.push(row.column_name);
    map.set(row.table_name, current);
  }
  return map;
}

async function collectionLabels(): Promise<Map<string, string>> {
  const rows = await db<{ collection: string; note: string | null }>("directus_collections")
    .select("collection", "note");
  return new Map(rows.map((row) => [row.collection, row.note?.trim() || row.collection]));
}

function primaryKeyForRow(row: Record<string, unknown>, primaryKeys: string[]): PrimaryKeyMap {
  const key: PrimaryKeyMap = {};
  for (const column of primaryKeys) key[column] = String(row[column]);
  return key;
}

function applyPrimaryKey(
  query: Knex.QueryBuilder<Record<string, unknown>, unknown[]>,
  primaryKey: PrimaryKeyMap,
): void {
  for (const [column, value] of Object.entries(primaryKey)) {
    assertSafeIdentifier(column);
    query.where(column, value);
  }
}

function displayName(row: Record<string, unknown>, primaryKeys: string[]): string {
  for (const field of DISPLAY_FIELDS) {
    const value = row[field];
    if (typeof value === "string" && value.trim() !== "") return value;
    if (typeof value === "number") return String(value);
  }
  const firstKey = primaryKeys[0];
  return firstKey ? String(row[firstKey] ?? "") : "";
}

function deletedAtString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date(String(value)).toISOString();
}

function remainingDays(deletedAt: string, now: number): number {
  const elapsed = Math.floor((now - new Date(deletedAt).getTime()) / DAY_MS);
  return Math.max(0, TRASH_RETENTION_DAYS - elapsed);
}

async function tableMetas(): Promise<TableMeta[]> {
  const [overview, primaryKeys, labels] = await Promise.all([
    getSchemaOverview(),
    primaryKeysByTable(),
    collectionLabels(),
  ]);
  return Object.entries(overview)
    .filter(([, columns]) => columns.some((column) => column.name === "deleted_at"))
    .map(([collection, columns]) => ({
      collection,
      columns,
      primaryKeys: primaryKeys.get(collection) ?? [],
      sourceKind: sourceKindFor(collection),
      sourceLabel: sourceKindFor(collection) === "collection" ? (labels.get(collection) ?? collection) : null,
    }));
}

async function visibleQueryFor(
  actor: Actor,
  meta: TableMeta,
  action: PermissionAction,
): Promise<{ query: Knex.QueryBuilder<Record<string, unknown>, Record<string, unknown>[]> }> {
  assertSafeIdentifier(meta.collection);
  const permission = await resolvePermission(actor, permissionCollection(meta.collection), action);
  if (!permission.allowed) {
    throw new ApiError(403, "PERMISSION_DENIED", "権限がありません");
  }
  const query = db<Record<string, unknown>>(meta.collection).whereNotNull("deleted_at");
  if (permission.rowFilter && canApplyRowFilter(meta.collection)) {
    applyFilter(query, permission.rowFilter, {
      collection: meta.collection,
      schemaOverview: { [meta.collection]: meta.columns },
      relations: await relationRows(),
    });
  }
  return { query };
}

export async function listTrash(actor: Actor): Promise<TrashItem[]> {
  const metas = await tableMetas();
  const now = Date.now();
  const rows = await Promise.all(
    metas.map(async (meta) => {
      const permission = await resolvePermission(actor, permissionCollection(meta.collection), "read");
      if (!permission.allowed) return [];
      const query = db<Record<string, unknown>>(meta.collection).whereNotNull("deleted_at");
      if (permission.rowFilter && canApplyRowFilter(meta.collection)) {
        applyFilter(query, permission.rowFilter, {
          collection: meta.collection,
          schemaOverview: { [meta.collection]: meta.columns },
          relations: await relationRows(),
        });
      }
      const deletedRows = await query.select("*").orderBy("deleted_at", "desc");
      return deletedRows.map((row, index): TrashItem => {
        const deletedAt = deletedAtString(row.deleted_at);
        const primaryKey = meta.primaryKeys.length > 0 ? primaryKeyForRow(row, meta.primaryKeys) : null;
        return {
          key: encodeKey({ collection: meta.collection, primaryKey: primaryKey ?? { __row: String(index) } }),
          collection: meta.collection,
          displayName: displayName(row, meta.primaryKeys),
          sourceKind: meta.sourceKind,
          sourceLabel: meta.sourceLabel,
          deletedAt,
          daysRemaining: remainingDays(deletedAt, now),
          canRestore: primaryKey !== null,
          disabledReason: primaryKey === null ? "missing_primary_key" : null,
        };
      });
    }),
  );
  return rows.flat().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

async function rowForKey(
  actor: Actor,
  key: TrashKey,
  action: PermissionAction,
): Promise<{ meta: TableMeta; row: Record<string, unknown> }> {
  if (!key.primaryKey || "__row" in key.primaryKey) {
    throw new ApiError(400, "PRIMARY_KEY_NOT_FOUND", "主キーが見つかりません");
  }
  const meta = (await tableMetas()).find((entry) => entry.collection === key.collection);
  if (!meta) throw new ApiError(404, "TRASH_ITEM_NOT_FOUND", "ゴミ箱の項目が見つかりません");
  if (meta.primaryKeys.length === 0) {
    throw new ApiError(400, "PRIMARY_KEY_NOT_FOUND", "主キーが見つかりません");
  }
  const { query } = await visibleQueryFor(actor, meta, action);
  applyPrimaryKey(query, key.primaryKey);
  const row = await query.first();
  if (!row) throw new ApiError(404, "TRASH_ITEM_NOT_FOUND", "ゴミ箱の項目が見つかりません");
  return { meta, row };
}

function targetLabel(collection: string): string {
  switch (collection) {
    case "directus_files":
      return "files";
    case "directus_folders":
      return "folders";
    case "ohmycms_labels":
      return "labels";
    default:
      return "collection";
  }
}

function manualReferences(collection: string, row: Record<string, unknown>): ReferenceIssue[] {
  if (collection === "ohmycms_label_assignments") {
    const targetType = row.target_type;
    const targetId = row.target_id;
    if (typeof targetId !== "string") return [];
    if (targetType === "file") {
      return [{
        column: "target_id",
        targetCollection: "directus_files",
        targetLabel: targetLabel("directus_files"),
        value: targetId,
        state: "missing",
      }];
    }
    if (targetType === "folder") {
      return [{
        column: "target_id",
        targetCollection: "directus_folders",
        targetLabel: targetLabel("directus_folders"),
        value: targetId,
        state: "missing",
      }];
    }
  }
  if (collection === "directus_activity") {
    const targetCollection = row.collection;
    const item = row.item;
    if (typeof targetCollection === "string" && typeof item === "string") {
      return [{
        column: "item",
        targetCollection,
        targetLabel: targetLabel(targetCollection),
        value: item,
        state: "missing",
      }];
    }
  }
  return [];
}

async function referenceState(issue: ReferenceIssue): Promise<ReferenceIssue | null> {
  assertSafeIdentifier(issue.targetCollection);
  const overview = await getSchemaOverview();
  const columns = overview[issue.targetCollection] ?? [];
  const primary = columns.find((column) => column.is_primary_key)?.name;
  if (!primary) return null;
  const hasDeletedAt = columns.some((column) => column.name === "deleted_at");
  const row = await db<Record<string, unknown>>(issue.targetCollection)
    .where(primary, issue.value)
    .first(hasDeletedAt ? ["deleted_at"] : [primary]);
  if (!row) return { ...issue, state: "missing" };
  if (hasDeletedAt && row.deleted_at !== null && row.deleted_at !== undefined) {
    return { ...issue, state: "trashed" };
  }
  return null;
}

async function outgoingReferences(
  collection: string,
  row: Record<string, unknown>,
  columns: ColumnInfo[],
): Promise<ReferenceIssue[]> {
  const issues: ReferenceIssue[] = [];
  for (const column of columns) {
    if (!column.foreign_key_table || !column.foreign_key_column) continue;
    const value = row[column.name];
    if (value === null || value === undefined || value === "") continue;
    issues.push({
      column: column.name,
      targetCollection: column.foreign_key_table,
      targetLabel: targetLabel(column.foreign_key_table),
      value: String(value),
      state: "missing",
    });
  }
  issues.push(...manualReferences(collection, row));
  const resolved = await Promise.all(issues.map(referenceState));
  return resolved.filter((issue): issue is ReferenceIssue => issue !== null);
}

async function collectRelated(
  collection: string,
  primaryKey: PrimaryKeyMap,
  seen: Set<string>,
): Promise<TrashKey[]> {
  const signature = encodeKey({ collection, primaryKey });
  if (seen.has(signature)) return [];
  seen.add(signature);
  const overview = await getSchemaOverview();
  const columns = overview[collection] ?? [];
  const query = db<Record<string, unknown>>(collection).whereNotNull("deleted_at");
  applyPrimaryKey(query, primaryKey);
  const row = await query.first();
  if (!row) return [];
  const issues = await outgoingReferences(collection, row, columns);
  const related: TrashKey[] = [];
  for (const issue of issues.filter((entry) => entry.state === "trashed")) {
    const targetColumns = overview[issue.targetCollection] ?? [];
    const targetPrimary = targetColumns.find((column) => column.is_primary_key)?.name;
    if (!targetPrimary) continue;
    const targetKey = { [targetPrimary]: issue.value };
    related.push({ collection: issue.targetCollection, primaryKey: targetKey });
    related.push(...await collectRelated(issue.targetCollection, targetKey, seen));
  }
  return related;
}

export async function planTrashRestore(actor: Actor, encodedKey: string): Promise<TrashRestorePlan> {
  const key = decodeKey(encodedKey);
  const { meta, row } = await rowForKey(actor, key, "update");
  const references = await outgoingReferences(meta.collection, row, meta.columns);
  const trashedReferences = references.filter((issue) => issue.state === "trashed");
  const missingReferences = references.filter((issue) => issue.state === "missing");
  const related = key.primaryKey
    ? await collectRelated(meta.collection, key.primaryKey, new Set())
    : [];
  return {
    key: encodedKey,
    displayName: displayName(row, meta.primaryKeys),
    requiresConfirmation: trashedReferences.length > 0 || missingReferences.length > 0,
    trashedReferences,
    missingReferences,
    relatedRestoreCount: related.length,
  };
}

async function restoreOne(
  trx: Knex.Transaction,
  key: TrashKey,
  nullColumns: string[],
): Promise<void> {
  if (!key.primaryKey) return;
  assertSafeIdentifier(key.collection);
  const patch: Record<string, unknown> = { deleted_at: null };
  for (const column of nullColumns) {
    assertSafeIdentifier(column);
    patch[column] = null;
  }
  const query = trx<Record<string, unknown>>(key.collection).whereNotNull("deleted_at");
  applyPrimaryKey(query, key.primaryKey);
  await query.update(patch);
}

export async function restoreTrashItem(
  actor: Actor,
  encodedKey: string,
  mode: RestoreMode,
): Promise<{ restored: number }> {
  const key = decodeKey(encodedKey);
  const { meta } = await rowForKey(actor, key, "update");
  const plan = await planTrashRestore(actor, encodedKey);
  const related = key.primaryKey && mode === "with_related"
    ? await collectRelated(meta.collection, key.primaryKey, new Set())
    : [];
  const nullColumns = mode === "only"
    ? [...plan.trashedReferences, ...plan.missingReferences].map((issue) => issue.column)
    : [];

  await db.transaction(async (trx) => {
    for (const relatedKey of related.reverse()) {
      await restoreOne(trx, relatedKey, []);
    }
    await restoreOne(trx, key, nullColumns);
  });
  return { restored: 1 + related.length };
}

export async function permanentlyDeleteTrashItem(actor: Actor, encodedKey: string): Promise<void> {
  const key = decodeKey(encodedKey);
  await rowForKey(actor, key, "delete");
  const primaryKey = key.primaryKey;
  if (!primaryKey) return;
  await db.transaction(async (trx) => {
    assertSafeIdentifier(key.collection);
    const query = trx<Record<string, unknown>>(key.collection).whereNotNull("deleted_at");
    applyPrimaryKey(query, primaryKey);
    await query.delete();
  });
}
