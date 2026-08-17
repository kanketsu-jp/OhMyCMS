import { requireActor } from "@/lib/auth/context";
import { readAttachment } from "@/lib/reports/attachments";
import { canManageReports, getBugReportThread } from "@/lib/reports/service";
import { errorResponse } from "@/lib/schema/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    const viewer = actor.type === "human" ? actor.userId : actor.onBehalfOf;
    const { id, attachmentId } = await params;

    const isManager = await canManageReports(actor);
    await getBugReportThread(id, { viewer, isManager });
    const attachment = await readAttachment(id, attachmentId);
    const headers = new Headers({
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(attachment.body.byteLength),
      "Content-Type": attachment.content_type,
      // Content-Disposition は付けない。SVG/HTML を受けずラスタ画像だけに閉じる判断とセットなので、
      // ATTACHMENT_TYPES を広げるときはこの配信ヘッダも必ず見直す。
      "X-Content-Type-Options": "nosniff",
    });
    return new Response(new Uint8Array(attachment.body), { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
