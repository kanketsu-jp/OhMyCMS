import { requireActor } from "@/lib/auth/context";
import { deleteLabel, updateLabel } from "@/lib/labels/service";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    return ok({ data: await updateLabel(actor, id, await readJsonObject(request)) });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * 🚨 システムラベルは 403（LABEL_IS_SYSTEM）で断る。404 にしない。
 *    「無い」と「消せない」を取り違えさせないため。
 */
export async function DELETE(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    await deleteLabel(actor, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
