import { requireActor } from "@/lib/auth/context";
import { requireAdminAccess } from "@/lib/permissions/resolve";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { createRelation, listRelations } from "@/lib/schema/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor);
    return ok(await listRelations());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor);
    const body = await readJsonObject(request);
    return ok(await createRelation(body));
  } catch (error) {
    return errorResponse(error);
  }
}
