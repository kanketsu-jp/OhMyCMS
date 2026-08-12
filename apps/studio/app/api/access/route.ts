import { requireActor } from "@/lib/auth/context";
import { createAccess, listAccess, requireAdmin } from "@/lib/admin/permissions-api";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor);
    return ok({ data: await listAccess() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor);
    return ok({ data: await createAccess(await readJsonObject(request)) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
