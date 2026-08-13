import { requireActor } from "@/lib/auth/context";
import { requireAdmin } from "@/lib/admin/permissions-api";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { listBugReports, submitBugReport } from "@/lib/reports/service";

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

/** 一覧は管理者だけ（報告には他の利用者の状況が書かれうるため）。 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:read");
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    return ok({ data: await listBugReports({ limit: Number.isFinite(limit) ? limit : 50 }) });
  } catch (error) {
    return errorResponse(error);
  }
}
