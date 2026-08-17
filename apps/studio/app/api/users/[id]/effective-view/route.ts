import { requireAdmin } from "@/lib/admin/permissions-api";
import { getEffectiveView } from "@/lib/admin/effective-view";
import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok } from "@/lib/schema/api";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:read");
    const { id } = await context.params;
    return ok({ data: await getEffectiveView(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
