import {
  GOOGLE_CODE_VERIFIER_COOKIE,
  GOOGLE_STATE_COOKIE,
  deleteCookieHeader,
  parseCookies,
  sessionCookieHeader,
  isSecureRequest,
} from "@/lib/auth/cookies";
import {
  exchangeGoogleCode,
  googleOAuthConfig,
  verifyGoogleIdToken,
} from "@/lib/auth/google";
import { issueSession, upsertGoogleUser } from "@/lib/auth/sessions";
import { errorResponse } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

function clearOAuthCookies(response: Response): Response {
  response.headers.append("Set-Cookie", deleteCookieHeader(GOOGLE_STATE_COOKIE));
  response.headers.append("Set-Cookie", deleteCookieHeader(GOOGLE_CODE_VERIFIER_COOKIE));
  return response;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookies = parseCookies(request.headers.get("cookie"));
    const expectedState = cookies.get(GOOGLE_STATE_COOKIE);
    const codeVerifier = cookies.get(GOOGLE_CODE_VERIFIER_COOKIE);

    if (!code || !state) {
      throw new ApiError(400, "OAUTH_CALLBACK_INVALID", "OAuth コールバックが不正です");
    }
    if (!expectedState || !codeVerifier || state !== expectedState) {
      throw new ApiError(401, "OAUTH_STATE_MISMATCH", "OAuth state が一致しません");
    }

    const config = googleOAuthConfig(request);
    const idToken = await exchangeGoogleCode(config, code, codeVerifier);
    const identity = await verifyGoogleIdToken(idToken, config.clientId);
    const user = await upsertGoogleUser(identity);
    const session = await issueSession(user.id, request);

    const response = new Response(null, {
      status: 302,
      headers: { location: new URL("/", request.url).toString() },
    });
    response.headers.append("Set-Cookie", sessionCookieHeader(session.rawToken, session.maxAge, isSecureRequest(request)));
    return clearOAuthCookies(response);
  } catch (error) {
    return clearOAuthCookies(errorResponse(error));
  }
}
