import { requireActor } from "@/lib/auth/context";
import { requireAdminAccess } from "@/lib/permissions/resolve";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import {
  deleteRelation,
  getRelation,
  updateRelation,
} from "@/lib/schema/service";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ many_collection: string; many_field: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:read");
    const { many_collection, many_field } = await ctx.params;
    const result = await getRelation(many_collection, many_field);
    if (!result) {
      throw new ApiError(404, "RELATION_NOT_FOUND", "リレーションが見つかりません");
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
    const { many_collection, many_field } = await ctx.params;
    const body = await readJsonObject(request);
    return ok(await updateRelation(many_collection, many_field, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:write");
    const { many_collection, many_field } = await ctx.params;
    return ok(await deleteRelation(many_collection, many_field));
  } catch (error) {
    return errorResponse(error);
  }
}
