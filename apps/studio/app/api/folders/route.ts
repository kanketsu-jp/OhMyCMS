import { requireActor } from "@/lib/auth/context";
import { createFolder, listFolders, recordBody } from "@/lib/files/service";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const url = new URL(request.url);
    return ok({
      data: await listFolders(actor, {
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    return ok({ data: await createFolder(actor, recordBody(await readJsonObject(request))) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
