import { requireActor } from "@/lib/auth/context";
import { requireAdminAccess } from "@/lib/permissions/resolve";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import {
  deleteCollection,
  getCollection,
  updateCollection,
} from "@/lib/schema/service";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:read");
    const { collection } = await ctx.params;
    const result = await getCollection(collection);
    if (!result) {
      throw new ApiError(404, "COLLECTION_NOT_FOUND", "コレクションが見つかりません");
    }
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:write");
    const { collection } = await ctx.params;
    const body = await readJsonObject(request);
    return ok(await updateCollection(collection, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:write");
    const { collection } = await ctx.params;
    return ok(await deleteCollection(collection));
  } catch (error) {
    return errorResponse(error);
  }
}
