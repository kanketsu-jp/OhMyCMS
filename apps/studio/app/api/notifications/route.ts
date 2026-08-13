import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok } from "@/lib/schema/api";
import { listNotifications } from "@/lib/notifications/service";

export const runtime = "nodejs";

/**
 * 自分宛の通知の一覧（F2 §2-F）。
 *
 * 🚨 **誰の通知を返すかはリクエストから受け取らない。** 認証済みの本人 ID だけを使う。
 *    `?recipient=` のようなパラメータを生やすと、そこが穴になる。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    // エージェント経由なら委任元の人間宛の通知を見せる。
    const recipient = actor.type === "human" ? actor.userId : actor.onBehalfOf;

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "true";
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);

    const result = await listNotifications(recipient, {
      unreadOnly,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
