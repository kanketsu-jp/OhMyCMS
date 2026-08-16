import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import {
  listTrash,
  permanentlyDeleteTrashItem,
  TRASH_RETENTION_DAYS,
} from "@/lib/trash/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    return ok({ data: await listTrash(actor), retention_days: TRASH_RETENTION_DAYS });
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
