import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { db } from "@/lib/db/knex";
import { trashRetentionDays } from "@/lib/trash/purge";
import { listTrash, permanentlyDeleteTrashItem } from "@/lib/trash/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    // 🚨 保持日数は SQL 側の正本から引く（掃除と同じ 1 つを読む）。
      return ok({ data: await listTrash(actor), retention_days: await trashRetentionDays(db) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireActor(request);
    const body = await readJsonObject(request);
    await permanentlyDeleteTrashItem(actor, String(body.key ?? ""));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
