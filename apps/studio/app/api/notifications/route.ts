import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok } from "@/lib/schema/api";
import {
  listNotifications,
  markAllRead,
  type NotificationCategory,
} from "@/lib/notifications/service";

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
    // タブ（あなた宛 / システム関係）。指定が無ければ両方返す。
    const rawCategory = url.searchParams.get("category");
    const category: NotificationCategory | undefined =
      rawCategory === "personal" || rawCategory === "system" ? rawCategory : undefined;

    const result = await listNotifications(recipient, {
      unreadOnly,
      limit: Number.isFinite(limit) ? limit : 50,
      category,
    });
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * 自分宛をまとめて既読にする（お知らせページの主要アクション）。
 *
 * 🚨 誰の分を既読にするかはリクエストから受け取らない。認証済みの本人だけ。
 * 🚨 返す `updated` が 0 でも失敗ではない（**もともと未読が無かった**）。
 *    呼ぶ側が「0 ＝ 効いていない」と読まないよう、件数として返す。
 */
export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const recipient = actor.type === "human" ? actor.userId : actor.onBehalfOf;

    const url = new URL(request.url);
    const rawCategory = url.searchParams.get("category");
    const category: NotificationCategory | undefined =
      rawCategory === "personal" || rawCategory === "system" ? rawCategory : undefined;

    return ok({ updated: await markAllRead(recipient, { category }) });
  } catch (error) {
    return errorResponse(error);
  }
}
