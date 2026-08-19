import { requireAdmin } from "@/lib/admin/permissions-api";
import { requireActor } from "@/lib/auth/context";
import { sendTestMail } from "@/lib/auth/otp-mailer";
import { mailConfig } from "@/lib/reports/service";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
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

    const body = request.headers.get("content-type")?.includes("application/json")
      ? await readJsonObject(request)
      : {};
    const stringValue = (key: string) => {
      const value = body[key];
      return value === undefined ? undefined : typeof value === "string" ? value : null;
    };
    const host = stringValue("smtp_host");
    const port = stringValue("smtp_port");
    const user = stringValue("smtp_user");
    const password = stringValue("smtp_password");
    if (host === null || port === null || user === null || password === null) {
      throw new ApiError(400, "INVALID_FIELD", "SMTP設定は文字列で指定してください");
    }
    const config = await mailConfig({ host, port, user, password: password || undefined });
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
