import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { resolvePermission, type PermissionAction } from "@/lib/permissions/resolve";
import { ApiError } from "@/lib/schema/errors";

/**
 * ファイルとフォルダに付けるラベル。
 *
 * 🚨 **権限は `directus_files` に相乗りしている**（ラベル専用の権限は作っていない）:
 *   ・読む   … `directus_files` の read
 *   ・作る/直す/消す … `directus_files` の update
 * 理由: ラベルは**ファイル管理の一部**で、単独で意味を持たない。専用の権限を作ると
 * 「ファイルは触れるがラベルは触れない」のような、**説明できない組み合わせ**が増える。
 * 🚨 これは設計判断。フォルダにも付くので `directus_folders` 側の権限も要るのでは、
 *    という指摘はありうる。**司令塔へ報告済み**。
 */

const TARGET_TYPES = new Set(["file", "folder"]);

type LabelRow = {
  id: string;
  name: string;
  color: string | null;
  is_system: boolean;
  system_key: string | null;
  created_at: string;
  created_by: string | null;
};

/**
 * 画面と SDK へ返す形。
 * 🚨 `system_key` は**返さない**。機械が内部で引くための鍵で、利用者には意味がない。
 *    ただし `is_system` は返す（**消せないことを画面で示す必要がある**ため）。
 */
export type PublicLabel = {
  id: string;
  name: string;
  color: string | null;
  is_system: boolean;
};

export type LabelTargetType = "file" | "folder";

function toPublic(row: LabelRow): PublicLabel {
  return { id: row.id, name: row.name, color: row.color, is_system: row.is_system };
}

async function assertPermission(actor: Actor, action: PermissionAction): Promise<void> {
  const permission = await resolvePermission(actor, "directus_files", action);
  if (!permission.allowed) {
    throw new ApiError(403, "PERMISSION_DENIED", "権限がありません");
  }
}

function actorUserId(actor: Actor): string {
  return actor.type === "human" ? actor.userId : actor.onBehalfOf;
}

function requireName(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "INVALID_FIELD", "ラベル名を入力してください");
  }
  const name = value.trim();
  if (name.length > 100) {
    throw new ApiError(400, "INVALID_FIELD", "ラベル名は100文字以内で入力してください");
  }
  return name;
}

function optionalColor(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 32) {
    throw new ApiError(400, "INVALID_FIELD", "色の指定が正しくありません");
  }
  return value;
}

function assertTargetType(value: string): asserts value is LabelTargetType {
  if (!TARGET_TYPES.has(value)) {
    throw new ApiError(400, "INVALID_FIELD", "対象の種類が正しくありません");
  }
}

export async function listLabels(actor: Actor): Promise<PublicLabel[]> {
  await assertPermission(actor, "read");
  // 🚨 システムラベルを先に、その後は名前順。画面で「消せないもの」が固まって見える。
  const rows = await db<LabelRow>("ohmycms_labels")
    .select("*")
    .orderBy([{ column: "is_system", order: "desc" }, { column: "name", order: "asc" }]);
  return rows.map(toPublic);
}

export async function createLabel(
  actor: Actor,
  body: Record<string, unknown>,
): Promise<PublicLabel> {
  await assertPermission(actor, "update");
  const name = requireName(body.name);
  const color = optionalColor(body.color) ?? null;

  // 🚨 同じ名前を2つ作らせない。DB の一意制約でも弾かれるが、
  //    そのままだと「重複キー」という内部の文言が利用者に出る。
  const existing = await db<LabelRow>("ohmycms_labels").where({ name }).first();
  if (existing) {
    throw new ApiError(409, "LABEL_EXISTS", "同じ名前のラベルがあります");
  }

  const [row] = await db<LabelRow>("ohmycms_labels")
    .insert({
      id: randomUUID(),
      name,
      color,
      is_system: false,
      created_by: actorUserId(actor),
    })
    .returning("*");
  return toPublic(row);
}

export async function updateLabel(
  actor: Actor,
  id: string,
  body: Record<string, unknown>,
): Promise<PublicLabel> {
  await assertPermission(actor, "update");
  const current = await db<LabelRow>("ohmycms_labels").where({ id }).first();
  if (!current) {
    throw new ApiError(404, "LABEL_NOT_FOUND", "ラベルが見つかりません");
  }

  const patch: Partial<LabelRow> = {};
  if (body.name !== undefined) {
    const name = requireName(body.name);
    if (name !== current.name) {
      const duplicate = await db<LabelRow>("ohmycms_labels").where({ name }).first();
      if (duplicate) {
        throw new ApiError(409, "LABEL_EXISTS", "同じ名前のラベルがあります");
      }
    }
    patch.name = name;
  }
  const color = optionalColor(body.color);
  if (color !== undefined) patch.color = color;

  if (Object.keys(patch).length === 0) return toPublic(current);

  const [row] = await db<LabelRow>("ohmycms_labels").where({ id }).update(patch).returning("*");
  return toPublic(row);
}

export async function deleteLabel(actor: Actor, id: string): Promise<void> {
  await assertPermission(actor, "update");
  const current = await db<LabelRow>("ohmycms_labels").where({ id }).first();
  if (!current) {
    throw new ApiError(404, "LABEL_NOT_FOUND", "ラベルが見つかりません");
  }
  // 🚨 システムラベルは消させない（要件）。**404 でなく 403** にして、
  //    「無い」と「消せない」を取り違えさせない。
  if (current.is_system) {
    throw new ApiError(403, "LABEL_IS_SYSTEM", "このラベルは削除できません");
  }
  // 割り当ては外部キーの CASCADE で一緒に消える。
  await db("ohmycms_labels").where({ id }).delete();
}

/** 対象1件に付いているラベル。 */
export async function labelsForTarget(
  actor: Actor,
  targetType: string,
  targetId: string,
): Promise<PublicLabel[]> {
  await assertPermission(actor, "read");
  assertTargetType(targetType);
  const rows = await db<LabelRow>("ohmycms_labels")
    .join(
      "ohmycms_label_assignments",
      "ohmycms_labels.id",
      "ohmycms_label_assignments.label_id",
    )
    .where({
      "ohmycms_label_assignments.target_type": targetType,
      "ohmycms_label_assignments.target_id": targetId,
    })
    .select("ohmycms_labels.*")
    .orderBy([{ column: "is_system", order: "desc" }, { column: "name", order: "asc" }]);
  return rows.map(toPublic);
}

/**
 * 対象に付くラベルを**丸ごと置き換える**。
 *
 * 🚨 差分（付ける・外す）でなく置き換えにしているのは、画面が「いま付いている一覧」を
 *    持っているため。差分にすると、**画面が古いときに意図しない付け外し**が起きる。
 */
export async function setLabelsForTarget(
  actor: Actor,
  targetType: string,
  targetId: string,
  labelIds: unknown,
): Promise<PublicLabel[]> {
  await assertPermission(actor, "update");
  assertTargetType(targetType);
  if (!Array.isArray(labelIds) || labelIds.some((id) => typeof id !== "string")) {
    throw new ApiError(400, "INVALID_FIELD", "ラベルの指定が正しくありません");
  }
  const ids = Array.from(new Set(labelIds as string[]));

  // 🚨 存在しないラベル ID を黙って捨てない。指定が通ったのに付いていない、を防ぐ。
  if (ids.length > 0) {
    const found = await db<LabelRow>("ohmycms_labels").whereIn("id", ids).select("id");
    if (found.length !== ids.length) {
      throw new ApiError(400, "LABEL_NOT_FOUND", "指定されたラベルが見つかりません");
    }
  }

  const userId = actorUserId(actor);
  await db.transaction(async (trx) => {
    await trx("ohmycms_label_assignments")
      .where({ target_type: targetType, target_id: targetId })
      .delete();
    if (ids.length > 0) {
      await trx("ohmycms_label_assignments").insert(
        ids.map((labelId) => ({
          label_id: labelId,
          target_type: targetType,
          target_id: targetId,
          created_by: userId,
        })),
      );
    }
  });

  return labelsForTarget(actor, targetType, targetId);
}

/**
 * 🚨 対象が消えたときに、その割り当ても消す。
 *
 * 割り当てには**外部キーを張っていない**（target_id が files と folders の
 * どちらも指すため、1本の外部キーで表せない）。**呼び忘れると、消えたファイルの
 * ラベルが残り続ける。** ファイル・フォルダの削除処理から必ず呼ぶこと。
 */
export async function removeLabelsForTarget(
  targetType: LabelTargetType,
  targetId: string,
): Promise<void> {
  await db("ohmycms_label_assignments")
    .where({ target_type: targetType, target_id: targetId })
    .delete();
}
