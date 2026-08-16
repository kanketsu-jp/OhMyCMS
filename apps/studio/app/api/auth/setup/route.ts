import {
  isDefaultSetupPassword,
  isSetupLocked,
  recordSetupFailure,
  resetSetupFailures,
  verifySetupPassword,
} from "@/lib/auth/setup";
import { issueSetupSession } from "@/lib/auth/setup-session";
import { issueSession } from "@/lib/auth/sessions";
import { sessionCookieHeader, setupCookieHeader, isSecureRequest } from "@/lib/auth/cookies";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { isOnboardingCompleted, localAdminUserId } from "@/lib/settings/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
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

    if (await isOnboardingCompleted()) {
      // 🚨 オンボーディング完了後は local-admin@localhost の本セッションを直接発行する。
      //    未完了時の一時セッション（setup-session）とは別物。これで /onboarding を経由せず /admin に入れる。
      const userId = await localAdminUserId();
      if (!userId) {
        // 🚨 **「パスワードが正しくありません」と言わない**（2026-08-17）。
        //    ここへ来るのは、**パスワードが合っているのに local admin を引き当てられない**とき。
        //    以前は同じ 401 AUTH_FAILED を返していたので、🚨 **利用者は「自分が間違えた」と読む**。
        //    実際は設定の側が壊れている（`ohmycms_settings.local_admin_user_id` が空）。
        // 🚨 利用者に「DB の話」もしない——**次にできること**だけを渡し、理由はログへ。
        console.error(
          "🚨 local admin を引き当てられません: ohmycms_settings.local_admin_user_id が空です。\n" +
            "  移行（20260817010000）で埋まらなかったか、初期設定より前の環境です。\n" +
            "  → 画面か CLI で、どの利用者が local admin かを指定してください。",
        );
        throw new ApiError(
          500,
          "LOCAL_ADMIN_NOT_LINKED",
          "設定が壊れています。もう一度初期設定からやり直すか、この画面のことを管理者に伝えてください。",
        );
      }
      const session = await issueSession(userId, request, "setup");
      const response = ok({ data: { type: "human", userId, role: null } });
      response.headers.append(
        "Set-Cookie",
        sessionCookieHeader(session.rawToken, session.maxAge, isSecureRequest(request)),
      );
      return response;
    }

    const session = issueSetupSession();
    const response = ok({ data: { setup: true } });
    response.headers.append("Set-Cookie", setupCookieHeader(session.token, session.maxAge, isSecureRequest(request)));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
