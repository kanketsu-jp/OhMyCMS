import { requireActor } from "@/lib/auth/context";
import { createItems, itemsQueryFromRequest, listItems } from "@/lib/items/service";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string }>;
};

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "INVALID_BODY", "JSONを指定してください");
  }
}

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { collection } = await ctx.params;
    return ok(await listItems(actor, collection, itemsQueryFromRequest(request)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { collection } = await ctx.params;
    const body = await readJson(request);
    return ok({ data: await createItems(actor, collection, body) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
