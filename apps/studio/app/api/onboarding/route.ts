import { requireAdmin } from "@/lib/admin/permissions-api";
import { deleteCookieHeader, parseCookies, sessionCookieHeader, SETUP_COOKIE } from "@/lib/auth/cookies";
import { requireActor } from "@/lib/auth/context";
import { issueSession } from "@/lib/auth/sessions";
import { isValidSetupSession, revokeSetupSession } from "@/lib/auth/setup-session";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { completeOnboardingWithAdmin, isOnboardingCompleted } from "@/lib/settings/service";

export const runtime = "nodejs";

async function canUseAdminAccess(request: Request): Promise<boolean> {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:write");
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    if (await isOnboardingCompleted()) {
      throw new ApiError(
        409,
        "ONBOARDING_ALREADY_COMPLETED",
        "初期設定は完了しています",
      );
    }

    const setupToken = parseCookies(request.headers.get("cookie")).get(SETUP_COOKIE) ?? null;
    const setupAuthorized = isValidSetupSession(setupToken);
    const adminAuthorized = setupAuthorized ? false : await canUseAdminAccess(request);
    if (!setupAuthorized && !adminAuthorized) {
      throw new ApiError(401, "UNAUTHORIZED", "ログインしてください");
    }

    const body = await readJsonObject(request);
    const user = await completeOnboardingWithAdmin(body);
    const session = await issueSession(user.userId, request);
    const response = ok({
      data: { type: "human", userId: user.userId, email: user.email, role: null },
    });

    if (setupAuthorized && setupToken) {
      revokeSetupSession(setupToken);
      response.headers.append("Set-Cookie", deleteCookieHeader(SETUP_COOKIE));
    }
    response.headers.append(
      "Set-Cookie",
      sessionCookieHeader(session.rawToken, session.maxAge),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
