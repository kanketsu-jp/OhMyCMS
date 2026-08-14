import { requireAdmin } from "@/lib/admin/permissions-api";
import { requireActor } from "@/lib/auth/context";
import { sendTestMail } from "@/lib/auth/otp-mailer";
import { mailConfig } from "@/lib/reports/service";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:write");

    if (actor.type !== "human") {
      // 🚨 宛先は「ログイン中の利用者のメール」。人間のセッション以外には送り先が無い。
      throw new ApiError(400, "MAIL_NOT_CONFIGURED", "メールの設定がありません");
    }

    const config = await mailConfig();
    if (!config) {
      throw new ApiError(400, "MAIL_NOT_CONFIGURED", "メールの設定がありません");
    }

    try {
      await sendTestMail(config, actor.email);
    } catch {
      // 🚨 理由は返さない（SMTPのエラーに接続先・ユーザー名が入るため）。
      throw new ApiError(500, "MAIL_TEST_FAILED", "テストメールを送信できませんでした");
    }

    return ok({ data: { sent: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
