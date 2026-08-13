import { requireActor } from "@/lib/auth/context";
import { createPermission, listPermissions, requireAdmin } from "@/lib/admin/permissions-api";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

/** URL のクエリから limit / offset を取り出す。値の検証は lib 側（parseListRange）が行う。 */
function range(url: URL) {
  return {
    limit: url.searchParams.get("limit"),
    offset: url.searchParams.get("offset"),
  };
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:read");
    const url = new URL(request.url);
    return ok({ data: await listPermissions(url.searchParams.get("policy"), range(url)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:write");
    return ok({ data: await createPermission(await readJsonObject(request)) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
