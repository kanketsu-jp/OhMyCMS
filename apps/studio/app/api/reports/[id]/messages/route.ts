import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { addBugReportMessage, canManageReports } from "@/lib/reports/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * 報告に 1 通返信する（チャットの 2 通目以降）。
 *
 * 堀池さん（2026-08-15）:
 * > 「不具合報告はチャット形式にする。初回はフォームっぽくしていい。
 * >   **それ以降は返信があったらお知らせに表示される。**」
 *
 * 🚨 **書ける相手かどうかは「読める相手か」と同じ判定**にしてある
 *    （サービス層が同じ WHERE を通る）。読めない報告へは書けない。
 * 🚨 一覧は作らない。やりとりは `GET /api/reports/[id]` が報告ごと返す
 *    （2 箇所から同じものを取れるようにしない）。
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    const author = actor.type === "human" ? actor.userId : actor.onBehalfOf;
    const { id } = await params;

    const body = await readJsonObject(request);
    const isManager = await canManageReports(actor);

    const message = await addBugReportMessage(id, {
      author,
      body: body.body,
      isManager,
    });
    return ok({ data: message }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
