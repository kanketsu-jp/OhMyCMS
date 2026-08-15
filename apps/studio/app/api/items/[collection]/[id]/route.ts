import { requireActor } from "@/lib/auth/context";
import {
  deleteItem,
  getItem,
  itemsQueryFromRequest,
  updateItem,
  type ActivityContext,
} from "@/lib/items/service";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string; id: string }>;
};

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("not object");
    }
    return body as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_BODY", "JSONオブジェクトを指定してください");
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
    const { collection, id } = await ctx.params;
    return ok({ data: await getItem(actor, collection, id, itemsQueryFromRequest(request)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { collection, id } = await ctx.params;
    const body = await readJsonObject(request);
    const context = activityContextFromRequest(request);
    return ok({ data: await updateItem(actor, collection, id, body, context) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { collection, id } = await ctx.params;
    const context = activityContextFromRequest(request);
    await deleteItem(actor, collection, id, context);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
