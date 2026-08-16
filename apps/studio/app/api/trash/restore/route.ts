import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { planTrashRestore, restoreTrashItem } from "@/lib/trash/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const body = await readJsonObject(request);
    const key = String(body.key ?? "");
    if (body.preview === true) {
      return ok({ plan: await planTrashRestore(actor, key) });
    }
    const mode = body.mode === "only" ? "only" : body.mode === "with_related" ? "with_related" : null;
    if (!mode) {
      throw new ApiError(400, "INVALID_RESTORE_MODE", "復元方法が不正です");
    }
    return ok(await restoreTrashItem(actor, key, mode));
  } catch (error) {
    return errorResponse(error);
  }
}
