import { requireActor } from "@/lib/auth/context";
import { requireAdminAccess } from "@/lib/permissions/resolve";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { createCollection, listCollections } from "@/lib/schema/service";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor);
    const includeSystem = request.nextUrl.searchParams.get("system") === "true";
    return ok(await listCollections(includeSystem));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor);
    const body = await readJsonObject(request);
    return ok(await createCollection(body));
  } catch (error) {
    return errorResponse(error);
  }
}
