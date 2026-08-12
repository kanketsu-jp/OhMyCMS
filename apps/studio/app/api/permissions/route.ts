import { requireActor } from "@/lib/auth/context";
import { createPermission, listPermissions, requireAdmin } from "@/lib/admin/permissions-api";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor);
    const url = new URL(request.url);
    return ok({ data: await listPermissions(url.searchParams.get("policy")) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor);
    return ok({ data: await createPermission(await readJsonObject(request)) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
