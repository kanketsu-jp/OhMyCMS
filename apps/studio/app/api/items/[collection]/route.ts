import { requireActor } from "@/lib/auth/context";
import {
  createItems,
  itemsQueryFromRequest,
  listItems,
  type ActivityContext,
} from "@/lib/items/service";
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

function activityContextFromRequest(request: Request): ActivityContext {
  return {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
    userAgent: request.headers.get("user-agent"),
  };
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
    const context = activityContextFromRequest(request);
    return ok({ data: await createItems(actor, collection, body, context) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
