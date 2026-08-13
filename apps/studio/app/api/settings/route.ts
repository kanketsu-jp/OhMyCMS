import { requireActor } from "@/lib/auth/context";
import { requireAdmin } from "@/lib/admin/permissions-api";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { getSettings, updateSettings } from "@/lib/settings/service";

export const runtime = "nodejs";

/**
 * 全体設定（F2 §2-A）。**追加のみ**で、既存 API は変えていない（契約 §2-1）。
 *
 * 読み取りに settings:read、更新に settings:write を要求する。
 * 既存の /api/users が settings:read を使っているのに合わせた。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:read");
    return ok({ data: await getSettings() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:write");
    const body = await readJsonObject(request);
    // 監査のため「誰が変えたか」を残す。エージェント経由なら委任元の人間を記録する。
    const updatedBy = actor.type === "human" ? actor.userId : actor.onBehalfOf;
    return ok({ data: await updateSettings(body, updatedBy) });
  } catch (error) {
    return errorResponse(error);
  }
}
