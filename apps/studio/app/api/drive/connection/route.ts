import { requireActor } from "@/lib/auth/context";
import { connectionStatus, disconnect } from "@/lib/drive/tokens";
import { requireCapability } from "@/lib/permissions/resolve";
import { getSettings } from "@/lib/settings/service";
import { errorResponse, ok } from "@/lib/schema/api";

export const runtime = "nodejs";

function userIdOf(actor: Awaited<ReturnType<typeof requireActor>>): string {
  return actor.type === "human" ? actor.userId : actor.onBehalfOf;
}

/**
 * 繋がっているかどうか。
 * 🚨 返すのは **繋がっているか** と **繋いだアカウントのメール**だけ。
 *    トークンは絶対に載せない（lib/drive/tokens.ts が外へ出さない作りになっている）。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    requireCapability(actor, "settings:read");
    const settings = await getSettings();
    return ok({
      data: {
        /**
         * 🚨 **「使える状態か」と「繋いだか」は別**。ここを1つにすると、
         *    画面が「管理者が設定していない」と「自分がまだ繋いでいない」を
         *    区別できず、**利用者は自分で直せるのか判断できない**。
         *    （この口は状態を答えるものなので、設定が無くても 503 にしない）
         */
        configured: Boolean(settings.drive_client_id),
        ...(await connectionStatus(userIdOf(actor))),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** 切断。保存してあるリフレッシュトークンを消す。 */
export async function DELETE(request: Request) {
  try {
    const actor = await requireActor(request);
    requireCapability(actor, "settings:write");
    await disconnect(userIdOf(actor));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
