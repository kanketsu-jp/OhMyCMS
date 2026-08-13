import { requireActor } from "@/lib/auth/context";
import { requireAdminAccess } from "@/lib/permissions/resolve";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { createCollection, listCollectionNames, listCollections } from "@/lib/schema/service";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:read");
    const includeSystem = request.nextUrl.searchParams.get("system") === "true";
    // 名前しか要らない呼び出し（サイドバー）は列の読み取りごと省く。
    if (request.nextUrl.searchParams.get("names") === "true") {
      return ok(await listCollectionNames(includeSystem));
    }
    return ok(await listCollections(includeSystem));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:write");
    const body = await readJsonObject(request);
    return ok(await createCollection(body));
  } catch (error) {
    return errorResponse(error);
  }
}
