import { requireActor } from "@/lib/auth/context";
import { deleteRole, getRole, requireAdmin, updateRole } from "@/lib/admin/permissions-api";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor);
    const { id } = await ctx.params;
    return ok({ data: await getRole(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor);
    const { id } = await ctx.params;
    return ok({ data: await updateRole(id, await readJsonObject(request)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor);
    const { id } = await ctx.params;
    await deleteRole(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
