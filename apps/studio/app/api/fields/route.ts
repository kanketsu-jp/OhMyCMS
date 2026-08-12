import { requireActor } from "@/lib/auth/context";
import { requireAdminAccess } from "@/lib/permissions/resolve";
import { errorResponse, ok } from "@/lib/schema/api";
import { listFields } from "@/lib/schema/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:read");
    return ok(await listFields());
  } catch (error) {
    return errorResponse(error);
  }
}
