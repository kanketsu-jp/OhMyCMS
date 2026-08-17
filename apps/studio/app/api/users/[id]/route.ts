import { requireActor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { requireAdmin } from "@/lib/admin/permissions-api";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

/**
 * 利用者 1 件。
 *
 * 🚨 **一覧（`/api/users`）と同じ列だけを返す。** 増やさない。
 *    増やすなら、**なぜその列が 1 件のときだけ要るのか**を書いてから足すこと。
 *    （`directus_users` には資格情報に近い列も在るので、**既定で全部返さない**。
 *    `decisions/user-tables-have-one-entrance`）
 *
 * 🚨 **見つからないときは 404。** 403 にしない——**在ることも教えない**、は
 *    「他人のものを覗こうとした」場面の話で、ここは管理者しか到達しない
 *    （`requireAdmin`）ので、**素直に「無い」と言うほうが直しやすい**。
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:read");
    const { id } = await context.params;
    const row = await db("directus_users")
      .select(
        "id",
        "first_name",
        "last_name",
        "email",
        "status",
        "role",
        "avatar_emoji",
        "last_access",
        "provider",
        "external_identifier",
      )
      .where({ id })
      .first();
    if (!row) throw new ApiError(404, "USER_NOT_FOUND", "その利用者は見つかりません");
    return ok({ data: row });
  } catch (error) {
    return errorResponse(error);
  }
}
