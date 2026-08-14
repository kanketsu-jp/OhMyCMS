import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import {
  canManageReports,
  getBugReportThread,
  setBugReportStatus,
} from "@/lib/reports/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * 1 件の報告と、そのやりとり。
 *
 * 🚨 **他人の報告は 404**（403 ではない）。403 だと「その ID の報告は在る」と
 *    分かってしまう。サービス層が WHERE で絞るので、ここでは分岐を書かない。
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    const viewer = actor.type === "human" ? actor.userId : actor.onBehalfOf;
    const { id } = await params;

    const isManager = await canManageReports(actor);
    const thread = await getBugReportThread(id, { viewer, isManager });
    return ok({ ...thread, can_manage: isManager });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * 解決済みにする／未解決へ戻す。
 *
 * 🚨 **管理できる人だけ。** 報告者本人が自分の報告を解決済みにはできない
 *    （直したかどうかを決めるのは受け取った側）。
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    const viewer = actor.type === "human" ? actor.userId : actor.onBehalfOf;
    const { id } = await params;

    if (!(await canManageReports(actor))) {
      throw new ApiError(403, "FORBIDDEN", "報告を管理する権限がありません");
    }

    const body = await readJsonObject(request);
    const status = body.status;
    if (status !== "open" && status !== "resolved") {
      throw new ApiError(400, "INVALID_FIELD", "status は open か resolved を指定してください");
    }

    return ok({ data: await setBugReportStatus(id, status, { actor: viewer }) });
  } catch (error) {
    return errorResponse(error);
  }
}
