import {
  isDefaultSetupPassword,
  isSetupLocked,
  recordSetupFailure,
  resetSetupFailures,
  verifySetupPassword,
} from "@/lib/auth/setup";
import { issueSetupSession } from "@/lib/auth/setup-session";
import { setupCookieHeader } from "@/lib/auth/cookies";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { isOnboardingCompleted } from "@/lib/settings/service";

export const runtime = "nodejs";

if (isDefaultSetupPassword()) {
  console.warn("[setup] 既定のセットアップパスワードのままです。本番では必ず変更してください");
}

export async function POST(request: Request) {
  try {
    if (await isOnboardingCompleted()) {
      return new Response(null, { status: 404 });
    }

    if (isSetupLocked()) {
      throw new ApiError(401, "AUTH_FAILED", "パスワードが正しくありません");
    }

    const body = await readJsonObject(request);
    const password = body.password;
    if (typeof password !== "string" || password.length === 0) {
      throw new ApiError(400, "INVALID_BODY", "パスワードを指定してください");
    }

    if (!verifySetupPassword(password)) {
      recordSetupFailure();
      throw new ApiError(401, "AUTH_FAILED", "パスワードが正しくありません");
    }

    resetSetupFailures();
    const session = issueSetupSession();
    const response = ok({ data: { setup: true } });
    response.headers.append("Set-Cookie", setupCookieHeader(session.token, session.maxAge));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
