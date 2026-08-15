import { requireActor } from "@/lib/auth/context";
import { deleteAllowedEmail } from "@/lib/auth/saml/allowlist";
import { requireAdmin } from "@/lib/admin/permissions-api";
import { errorResponse } from "@/lib/schema/api";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:write");
    const { id } = await ctx.params;
    await deleteAllowedEmail(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
