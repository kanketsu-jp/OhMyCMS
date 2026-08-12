import { requireActor } from "@/lib/auth/context";
import { requireAdminAccess } from "@/lib/permissions/resolve";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { deleteField, getField, updateField } from "@/lib/schema/service";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string; field: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor);
    const { collection, field } = await ctx.params;
    const result = await getField(collection, field);
    if (!result) {
      throw new ApiError(404, "FIELD_NOT_FOUND", "フィールドが見つかりません");
    }
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor);
    const { collection, field } = await ctx.params;
    const body = await readJsonObject(request);
    return ok(await updateField(collection, field, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor);
    const { collection, field } = await ctx.params;
    return ok(await deleteField(collection, field));
  } catch (error) {
    return errorResponse(error);
  }
}
