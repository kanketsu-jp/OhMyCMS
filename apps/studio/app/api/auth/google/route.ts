import {
  GOOGLE_CODE_VERIFIER_COOKIE,
  GOOGLE_STATE_COOKIE,
  oauthCookieHeader,
  isSecureRequest,
} from "@/lib/auth/cookies";
import { randomToken } from "@/lib/auth/crypto";
import { googleAuthorizationUrl, googleOAuthConfig } from "@/lib/auth/google";
import { errorResponse } from "@/lib/schema/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const config = await googleOAuthConfig(request);
    const state = randomToken(32);
    const codeVerifier = randomToken(64);
    const location = googleAuthorizationUrl(config, state, codeVerifier);

    const response = new Response(null, {
      status: 302,
      headers: { location },
    });
    response.headers.append("Set-Cookie", oauthCookieHeader(GOOGLE_STATE_COOKIE, state, isSecureRequest(request)));
    response.headers.append(
      "Set-Cookie",
      oauthCookieHeader(GOOGLE_CODE_VERIFIER_COOKIE, codeVerifier, isSecureRequest(request)),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
