import { requireActor } from "@/lib/auth/context";
import { deleteFile, getFile, recordBody, rotatePublicToken, updateFile } from "@/lib/files/service";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    return ok({ data: await getFile(actor, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    return ok({ data: await updateFile(actor, id, recordBody(await readJsonObject(request))) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    await deleteFile(actor, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    return ok({ data: await rotatePublicToken(actor, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
