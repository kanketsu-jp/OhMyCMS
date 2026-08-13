import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { markRead } from "@/lib/notifications/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * 通知を既読/未読にする（F2 §2-F）。
 *
 * 🚨 他人の通知 ID を直打ちされても、サービス層が recipient を WHERE に含めるので
 *    0 件更新になり 404 を返す（存在も教えない）。MVP 受入基準 #8 と同じ考え方。
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    const recipient = actor.type === "human" ? actor.userId : actor.onBehalfOf;
    const { id } = await params;
    const body = await readJsonObject(request);
    // 既定は「既読にする」。read: false で未読へ戻せる。
    const read = body.read === undefined ? true : body.read === true;
    return ok({ data: await markRead(id, recipient, read) });
  } catch (error) {
    return errorResponse(error);
  }
}
