import { requireActor } from "@/lib/auth/context";
import { listDriveFiles } from "@/lib/drive/client";
import { driveOAuthConfig } from "@/lib/drive/config";
import { getAccessTokenFor } from "@/lib/drive/tokens";
import { requireCapability } from "@/lib/permissions/resolve";
import { errorResponse, ok } from "@/lib/schema/api";

export const runtime = "nodejs";

/**
 * ドライブのファイルを一覧する（**取り込むものを選ばせるため**）。
 *
 * 🚨 **中身は返さない。** ここで返すのは名前・種類・更新日時など**選ぶのに要る分だけ**で、
 *    実体は取り込み（`/api/drive/import`）で初めて落とす。
 * 🚨 **アクセストークンはこの関数の中だけ**。レスポンスにも載せない。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    requireCapability(actor, "settings:read");
    const userId = actor.type === "human" ? actor.userId : actor.onBehalfOf;
    const config = await driveOAuthConfig(request);
    const accessToken = await getAccessTokenFor(userId, config.clientId);

    const url = new URL(request.url);
    return ok({
      data: await listDriveFiles(accessToken, {
        search: url.searchParams.get("q"),
        pageToken: url.searchParams.get("pageToken"),
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
