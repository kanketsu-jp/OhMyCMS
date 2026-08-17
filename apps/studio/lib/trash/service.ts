import type { Knex } from "knex";
import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { rowLabel } from "@/lib/display/row-label";
import { deleteStoredObjects } from "@/lib/files/service";
import { trashRetentionDays } from "./purge";
import { applyFilter } from "@/lib/items/filter";
import { resolvePermission, type PermissionAction } from "@/lib/permissions/resolve";
import { ApiError } from "@/lib/schema/errors";
import { getSchemaOverview } from "@/lib/schema/introspect";
import type { ColumnInfo, RelationMeta } from "@/lib/schema/models";
import { assertSafeIdentifier } from "@/lib/schema/validate";

// 設定化は別作業。決定は knowledge/decisions/trash-and-restore-ui.md §4
// 🚨 **保持日数の正本は SQL 側**（`ohmycms_trash_retention_days()`）。
// ここに `90` を書き戻さないこと——**掃除と画面が別々の数を持つと、
// 掃除が消したあとも画面が「あと N 日」と言う**ずれ方をする。
// 読むには `trashRetentionDays(conn)`（`lib/trash/purge.ts`）を使う。

const DAY_MS = 24 * 60 * 60 * 1000;
// 🚨 **「その 1 行を人にどう見せるか」の答えは `lib/display/row-label.ts` に 1 つだけ置く。**
//    ここに在った `DISPLAY_FIELDS` は、**同じ問いの 2 つ目の答え**になっていた
//    （カード表示 / 関連の相手 / 横断検索 / ゴミ箱の 4 箇所に出る問い）。
//    **順番も含めて 1 文字も変えずに移した**ので、表示は変わらない。

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
  /**
   * 🚨 **指し先の「行」の名前**（`targetLabel` は**種類**なので別物）。
   * 確認の文言「この項目は **◯◯** を指していますが…」の ◯◯ はこちら。
   * 種類（"collection" / "files"）を入れると「この項目は *collection* を指しています」になる。
   * 🚨 **1 つの値に意味を 2 つ入れない**（schema の指摘・2026-08-16）。
   * 指し先が見つからない／名前を取れないときは **null**（**呼ぶ側が「不明」を出せるように**）。
   */
  targetName: string | null;
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
  /**
   * 押せない理由。**画面はこの値から文言を引く**（理由を直書きしない）。
   * 🚨 `system_table` … 許可リストに無いシステム表（`TRASH_SYSTEM_COLLECTIONS`）。
   *    **一覧には出るが、復元も完全削除もできない**（サーバが 400 を返す）。
   *    これを返さないと **`canRestore: true` のまま出て、押した瞬間にエラー**になる。
   */
  disabledReason: "missing_primary_key" | "system_table" | null;
  canDeletePermanently: boolean;
  deleteDisabledReason: "permission_assigned" | null;
  assignedPolicies: string[];
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

/**
 * ゴミ箱が扱ってよいシステム表。**ここに書いた名前だけ**が
 * `assertSafeIdentifier`（items API の壁）を迂回できる。
 *
 * 🚨 なぜ列挙するか: 条件で緩めると（「`ohmycms_` なら通す」等）、
 *    **次に足された `ohmycms_*` が黙って通る**。列挙なら、足す人が必ずここに気づく。
 *
 * 🚨 `sourceKindFor` を流用しないこと。あれは **札の対応表**で `default` を持つ。
 *    「ゴミ箱に入る表」の定義は `tableMetas()`（`deleted_at` を持つ表を実行時に探す）で、
 *    そちらは **GUI で作った利用者コレクションも含む**（＝ 許可リストにはならない）。
 *
 * `directus_permissions` は、割り当ての無い行だけ完全削除を許可する。
 *    割り当て済みの権限を物理削除すると、認可ルールが黙って消えるため、
 *    サーバ側で拒否する。
 */
const TRASH_SYSTEM_COLLECTIONS = new Set([
  "directus_files",
  "directus_folders",
  "ohmycms_labels",
  "ohmycms_label_assignments",
  "directus_permissions",
]);

/**
 * ゴミ箱の経路で表名を検証する。
 *
 * 🚨 これが無かったせいで、**一覧には出るのに復元も完全削除もできない**状態だった
 *    （2026-08-17 実測: ゴミ箱の `directus_files` 69 件が、削除も復元も 400 `SYSTEM_IDENTIFIER`）。
 *    `listTrash` は `assertSafeIdentifier` を通らないので一覧には出て、
 *    `visibleQueryFor` が通るので**押した瞬間に落ちる**——「見えるのに押せない」。
 *
 * 利用者コレクションは従来どおり `assertSafeIdentifier` で守る（items API の壁は緩めない）。
 */
function assertTrashCollection(collection: string): void {
  if (TRASH_SYSTEM_COLLECTIONS.has(collection)) return;
  assertSafeIdentifier(collection);
}

/**
 * その表をゴミ箱の操作（復元・完全削除）に掛けられるか。
 *
 * 🚨 **判定を二重に持たない**ために、実際の検証をそのまま試す。
 *    条件を書き写すと（「システム表かつ許可リストに無い」等）、
 *    **許可リストを足したときに片方だけ古くなり、
 *    「押せると言っておいて 400」または「押せないと言っておいて通る」**が起きる。
 */
function trashOperable(collection: string): boolean {
  try {
    assertTrashCollection(collection);
    return true;
  } catch {
    return false;
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

async function assignedPolicyNames(permissionIds: number[]): Promise<Map<number, string[]>> {
  if (permissionIds.length === 0) return new Map();
  const rows = await db<{ permission_id: number; name: string }>("directus_permissions")
    .join("directus_access", "directus_permissions.policy", "directus_access.policy")
    .join("directus_policies", "directus_access.policy", "directus_policies.id")
    .whereIn("directus_permissions.id", permissionIds)
    .distinct("directus_permissions.id as permission_id", "directus_policies.name")
    .orderBy("directus_policies.name");
  const result = new Map<number, string[]>();
  for (const row of rows) result.set(row.permission_id, [...(result.get(row.permission_id) ?? []), row.name]);
  return result;
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

/**
 * 🚨 **判定を持たない。** 呼び方をここに残しているだけで、答えは `rowLabel` が持つ。
 *
 * 🚨 **雛形（`display_template`）はまだ渡していない。** ゴミ箱は行を**表ごと**に集めており、
 *    `directus_collections` の雛形を引く経路をここに足すと**問い合わせが 1 本増える**。
 *    いまは**読む所が 0 件・実データも全部 null**（2026-08-17 実測）なので、
 *    **渡す価値が出た時に渡す**（＝ 渡していないことを、ここに書いておく）。
 */
function displayName(row: Record<string, unknown>, primaryKeys: string[]): string {
  return rowLabel({ row, primaryKeys });
}

function deletedAtString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date(String(value)).toISOString();
}

function remainingDays(deletedAt: string, now: number, retentionDays: number): number {
  const elapsed = Math.floor((now - new Date(deletedAt).getTime()) / DAY_MS);
  return Math.max(0, retentionDays - elapsed);
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
  assertTrashCollection(meta.collection);
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
  // 🚨 保持日数は SQL 側の正本から引く（この関数の中に 90 を書かない）。
  const retentionDays = await trashRetentionDays(db);
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
      const operable = trashOperable(meta.collection);
      const assignments = meta.collection === "directus_permissions"
        ? await assignedPolicyNames(deletedRows.map((row) => Number(row.id)))
        : new Map<number, string[]>();
      return deletedRows.map((row, index): TrashItem => {
        const deletedAt = deletedAtString(row.deleted_at);
        const primaryKey = meta.primaryKeys.length > 0 ? primaryKeyForRow(row, meta.primaryKeys) : null;
        const assignedPolicies = meta.collection === "directus_permissions"
          ? assignments.get(Number(row.id)) ?? []
          : [];
        return {
          key: encodeKey({ collection: meta.collection, primaryKey: primaryKey ?? { __row: String(index) } }),
          collection: meta.collection,
          displayName: displayName(row, meta.primaryKeys),
          sourceKind: meta.sourceKind,
          sourceLabel: meta.sourceLabel,
          deletedAt,
          daysRemaining: remainingDays(deletedAt, now, retentionDays),
          canRestore: primaryKey !== null && operable,
          // 🚨 主キーが無いほうを先に出す（**そちらは復元先が特定できない**ので、より根本的）。
          disabledReason: primaryKey === null
            ? "missing_primary_key"
            : operable
              ? null
                : "system_table",
          canDeletePermanently: primaryKey !== null && operable && assignedPolicies.length === 0,
          deleteDisabledReason: assignedPolicies.length > 0 ? "permission_assigned" : null,
          assignedPolicies,
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
        targetName: null,
        value: targetId,
        state: "missing",
      }];
    }
    if (targetType === "folder") {
      return [{
        column: "target_id",
        targetCollection: "directus_folders",
        targetLabel: targetLabel("directus_folders"),
        targetName: null,
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
        targetName: null,
        value: item,
        state: "missing",
      }];
    }
  }
  return [];
}

async function referenceState(issue: ReferenceIssue): Promise<ReferenceIssue | null> {
  const overview = await getSchemaOverview();
  // 🚨 **指し先は許可リストで絞らない。** ここは「その行がどこを指しているか」を**読むだけ**で、
  //    指し先は**利用者が選べない**（外部キーの定義・`manualReferences` の定数・活動ログの
  //    `collection` 列）。許可リストで絞ると、**実在する指し先まで 400 になる**
  //    （2026-08-17 実測: ファイルの復元プレビューが `uploaded_by` → `directus_users` で落ちた。
  //     `directus_files` を通しただけでは直らず、**2 段目で同じ壁に当たった**）。
  // 🚨 代わりに **スキーマに実在する表だけ**を通す。名前は DB 由来になるので、
  //    名前の形を検査するより強い（活動ログの `collection` は利用者の入力が入りうる）。
  const columns = overview[issue.targetCollection];
  if (!columns) return null;
  const primary = columns.find((column) => column.is_primary_key)?.name;
  if (!primary) return null;
  const hasDeletedAt = columns.some((column) => column.name === "deleted_at");
  // 🚨 **入口（itemsTable）を通さない。** 指し先は**ゴミ箱に在る**（deleted_at が立っている）ので、
  //    入口を通すと**必ず 0 件**になる（schema の指摘・2026-08-16）。ここは直に引く。
  // 🚨 表示名も**同じ問い合わせで**取る（問い合わせを増やさない）。
  //    列は `*` で取り、`displayName()` に渡す（一覧の「何を」と**同じ文字列**になる）。
  const row = await db<Record<string, unknown>>(issue.targetCollection)
    .where(primary, issue.value)
    .first();
  if (!row) return { ...issue, state: "missing" };
  const targetName = displayName(row, [primary]);
  if (hasDeletedAt && row.deleted_at !== null && row.deleted_at !== undefined) {
    return { ...issue, state: "trashed", targetName: targetName || null };
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
      targetName: null,
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
  assertTrashCollection(key.collection);
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

export async function permanentlyDeleteTrashItem(
  actor: Actor,
  encodedKey: string,
  context: { ip: string; userAgent: string | null } = { ip: "", userAgent: null },
): Promise<void> {
  const key = decodeKey(encodedKey);
  await rowForKey(actor, key, "delete");
  const primaryKey = key.primaryKey;
  if (!primaryKey) return;

  // 🚨 **ファイルは「行」と「実体」の 2 つを消す。順序は 実体 → 行。**
  //    逆にすると、行が消えたあとに実体の削除が失敗したとき **どの実体が孤児か誰も辿れない**
  //    （決定: knowledge/decisions/deleting-a-file-is-two-deletes.md）。
  // 🚨 **トランザクションの外**で消す。保管先の削除は巻き戻せないので、
  //    中に入れても「消えたものが戻る」ことはなく、**戻ったつもりになるだけ**。
  // 🚨 実体が**元から無かった**のは失敗ではない（`deleteStoredObjects` が missing として返す）。
  //    ここで投げると、**同じ id で永久に完全削除できなくなる**。
  if (key.collection === "directus_files") {
    const id = primaryKey.id;
    if (id) await deleteStoredObjects(id);
  }

  try {
    await db.transaction(async (trx) => {
      assertTrashCollection(key.collection);
      if (key.collection === "directus_permissions") {
        const permission = await trx<{ id: number; policy: string }>("directus_permissions")
          .select("id", "policy")
          .whereNotNull("deleted_at")
          .modify((query) => {
            for (const [column, value] of Object.entries(key.primaryKey ?? {})) query.where(column as "id", value);
          })
          .forUpdate()
          .first();
        if (!permission) throw new ApiError(404, "TRASH_ITEM_NOT_FOUND", "ゴミ箱の項目が見つかりません");
        const assignments = await trx<{ name: string }>("directus_access")
          .join("directus_policies", "directus_access.policy", "directus_policies.id")
          .where("directus_access.policy", permission.policy)
          .select("directus_policies.name")
          .distinct()
          .orderBy("directus_policies.name");
        if (assignments.length > 0) {
          throw new ApiError(
            409,
            "PERMISSION_ASSIGNED",
            `この権限はポリシー「${assignments.map((row) => row.name).join("、")}」に割り当てられているため完全に削除できません。先に割り当てを外してください`,
          );
        }
      }
      const query = trx<Record<string, unknown>>(key.collection).whereNotNull("deleted_at");
      applyPrimaryKey(query, primaryKey);
      const deleted = await query.delete();
      if (!deleted) throw new ApiError(404, "TRASH_ITEM_NOT_FOUND", "ゴミ箱の項目が見つかりません");
      await trx("directus_activity").insert({
        action: "delete",
        user: actor.type === "human" ? actor.userId : null,
        actor_type: actor.type,
        actor_id: actor.type === "agent" ? actor.agentId : null,
        collection: key.collection,
        item: String(primaryKey.id ?? Object.values(primaryKey)[0]),
        ip: context.ip,
        user_agent: context.userAgent,
      });
    });
  } catch (error) {
    // 🚨 **他の行から参照されている行を完全削除すると、pg が `23503` を投げる。**
    //   それがそのまま上がって **500 INTERNAL_ERROR** になっていた（2026-08-17・design が実測。
    //   🟢 対照: 参照されていない行は 204／その子を先に消せば親も 204）。
    //   利用者から見ると「**押したら壊れた**」で、次に何をすればよいか分からない。
    //   ＝ **「まだ参照している行が在るので消せません」なら直せる情報**になる。
    //
    // 🚨 **共有の `PG_STATE_TO_API`（`lib/schema/errors.ts`）には足さない。**
    //   あの表は `runTranslatingDbErrors` 経由で **insert の経路にも掛かる**（`lib/items/service.ts:1078`）。
    //   `23503` は **insert なら「指し先が無い」／delete なら「指されている」**で、**意味が逆**。
    //   1 つの表に入れると、**片方には必ず嘘の文言**になる
    //   （`i18n/error.ts` が `FOLDER_NOT_EMPTY` で同じ理由の取り消しを記録している）。
    if ((error as { code?: unknown } | null)?.code === "23503") {
      throw new ApiError(
        409,
        "ITEM_REFERENCED",
        "他の項目から参照されているため、完全に削除できません",
      );
    }
    throw error;
  }
}
