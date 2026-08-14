import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import {
  canManageReports,
  listBugReports,
  submitBugReport,
  type BugReportStatus,
} from "@/lib/reports/service";

export const runtime = "nodejs";

/**
 * 不具合の報告（F2 §2-G）。
 *
 * 🚨 **メールが設定されていなくても 500 にしない。** 保存が本体で、送信はおまけ。
 *    送信の可否は本文の mail_status で返す（skipped / sent / failed）。
 *
 * 🚨 **リクエストヘッダをまとめて保存しない。** 渡すのは User-Agent だけ。
 *    Cookie やトークンが報告に紛れ込むのを、入口の段階で防ぐ。
 */
export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const reporter = actor.type === "human" ? actor.userId : actor.onBehalfOf;
    const body = await readJsonObject(request);

    const report = await submitBugReport(body, {
      reporter,
      userAgent: request.headers.get("user-agent"),
    });
    return ok({ data: report }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * チャットルームの一覧。
 *
 * - 既定は**自分が出した報告だけ**（誰でも見られる ＝「報告一覧」）
 * - `?scope=all` は**管理できる人だけ**（＝「報告管理」）。
 *   🚨 権限が無ければ **403 で断る**。UI 側で隠すだけにしない（`AGENTS.md §3.5`）。
 *
 * 🚨 「誰の報告を返すか」をリクエストから受け取らない。認証済みの本人 ID だけを使う。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const viewer = actor.type === "human" ? actor.userId : actor.onBehalfOf;

    const url = new URL(request.url);
    const wantsAll = url.searchParams.get("scope") === "all";
    const manager = await canManageReports(actor);
    if (wantsAll && !manager) {
      throw new ApiError(403, "FORBIDDEN", "報告を管理する権限がありません");
    }

    // 未解決 / 解決済みのタブ。指定が無ければ両方。
    const rawStatus = url.searchParams.get("status");
    const status: BugReportStatus | undefined =
      rawStatus === "open" || rawStatus === "resolved" ? rawStatus : undefined;

    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);

    const data = await listBugReports({
      scope: wantsAll ? "all" : "mine",
      viewer,
      status,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    // 画面の出し分け（報告一覧か報告管理か）に使うので、権限も返す。
    return ok({ data, can_manage: manager });
  } catch (error) {
    return errorResponse(error);
  }
}
