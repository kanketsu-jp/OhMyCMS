import {
  isDefaultSetupPassword,
  isSetupLocked,
  recordSetupFailure,
  resetSetupFailures,
  verifySetupPassword,
} from "@/lib/auth/setup";
import { issueSetupSession } from "@/lib/auth/setup-session";
import { setupCookieHeader, isSecureRequest } from "@/lib/auth/cookies";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { isOnboardingCompleted } from "@/lib/settings/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // 初期設定後は setup の入口を恒久的に閉じる。404 にして、入口の存在や状態を明かさない。
    // やり直しが必要な場合だけ、DB 管理者が次の SQL を実行してから再試行する:
    //   UPDATE ohmycms_settings SET onboarding_completed_at = NULL WHERE id = 1;
    if (await isOnboardingCompleted()) {
      throw new ApiError(404, "NOT_FOUND", "見つかりません");
    }

    if (isSetupLocked()) {
      throw new ApiError(401, "AUTH_FAILED", "パスワードが正しくありません");
    }

    const body = await readJsonObject(request);
    const password = body.password;
    if (typeof password !== "string" || password.length === 0) {
      throw new ApiError(400, "INVALID_BODY", "パスワードを指定してください");
    }

    if (!(await verifySetupPassword(password))) {
      recordSetupFailure();
      throw new ApiError(401, "AUTH_FAILED", "パスワードが正しくありません");
    }

    resetSetupFailures();

    // 🚨 モジュール先頭ではなく成功時に確認する（isDefaultSetupPassword が非同期になったため）。
    //    値そのものは出さない。
    if (await isDefaultSetupPassword()) {
      console.warn("[setup] 既定のセットアップパスワードのままです。本番では必ず変更してください");
    }

    const session = issueSetupSession();
    const response = ok({ data: { setup: true } });
    response.headers.append("Set-Cookie", setupCookieHeader(session.token, session.maxAge, isSecureRequest(request)));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
