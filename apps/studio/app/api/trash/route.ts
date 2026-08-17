import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { db } from "@/lib/db/knex";
import { lastPurgeRun, trashRetentionDays } from "@/lib/trash/purge";
import { listTrash, permanentlyDeleteTrashItem } from "@/lib/trash/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    // 🚨 保持日数は SQL 側の正本から引く（掃除と同じ 1 つを読む）。
    // 🚨 `last_purge` は「掃除が落ちていること」を人に見せるためのもの。
    //    記録に残るだけでは誰も見ないので、認証済みのこの口に載せる（health は認証不要なので載せない）。
    //    null = まだ 1 度も走っていない。deleted_total 0 = 走って何も無かった。**別のこと**。
    return ok({
      data: await listTrash(actor),
      retention_days: await trashRetentionDays(db),
      last_purge: await lastPurgeRun(db),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireActor(request);
    const body = await readJsonObject(request);
    await permanentlyDeleteTrashItem(actor, String(body.key ?? ""), {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
      userAgent: request.headers.get("user-agent"),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
