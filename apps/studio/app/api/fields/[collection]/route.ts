import { requireActor } from "@/lib/auth/context";
import { requireAdminAccess } from "@/lib/permissions/resolve";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { createField, listFields } from "@/lib/schema/service";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:read");
    const { collection } = await ctx.params;
    return ok(await listFields(collection));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:write");
    const { collection } = await ctx.params;
    const body = await readJsonObject(request);
    return ok(await createField(collection, body));
  } catch (error) {
    return errorResponse(error);
  }
}
