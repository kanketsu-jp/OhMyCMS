import { requireActor } from "@/lib/auth/context";
import { driveOAuthConfig } from "@/lib/drive/config";
import { importFromDrive } from "@/lib/drive/import";
import { requireCapability } from "@/lib/permissions/resolve";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

export const runtime = "nodejs";

/**
 * ドライブのファイルを複製して取り込む。
 * 🚨 権限は `uploadFile` が `directus_files` の create で判定する（ここでは二重に持たない）。
 */
export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    requireCapability(actor, "settings:write");
    const config = await driveOAuthConfig(request);
    const body = await readJsonObject(request);
    const row = await importFromDrive(actor, config.clientId, {
      fileId: typeof body.fileId === "string" ? body.fileId : "",
      folder: typeof body.folder === "string" ? body.folder : null,
      compress: body.compress === false ? false : undefined,
    });
    return ok({ data: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
