import { requireActor } from "@/lib/auth/context";
import { isSecureRequest, oauthCookieHeader } from "@/lib/auth/cookies";
import { randomToken } from "@/lib/auth/crypto";
import {
  DRIVE_CODE_VERIFIER_COOKIE,
  DRIVE_STATE_COOKIE,
  driveOAuthConfig,
} from "@/lib/drive/config";
import { authorizationUrl, createPkcePair } from "@/lib/drive/oauth";
import { requireCapability } from "@/lib/permissions/resolve";
import { errorResponse } from "@/lib/schema/api";

export const runtime = "nodejs";

/**
 * ドライブへ繋ぐ入口。Google の同意画面へ送る。
 *
 * 🚨 **ログイン済みでなければ始めない。** 誰の接続として保存するかが決まらないため。
 * 🚨 `code_verifier` と `state` は **HttpOnly Cookie** で持ち回る。
 *    verifier が外から読めると PKCE の意味が無くなる。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    requireCapability(actor, "settings:write");
    const config = await driveOAuthConfig(request);
    const state = randomToken(32);
    const { codeVerifier, codeChallenge } = createPkcePair();

    const response = new Response(null, {
      status: 302,
      headers: {
        location: authorizationUrl({
          clientId: config.clientId,
          redirectUri: config.redirectUri,
          codeChallenge,
          state,
        }),
      },
    });
    const secure = isSecureRequest(request);
    response.headers.append("Set-Cookie", oauthCookieHeader(DRIVE_STATE_COOKIE, state, secure));
    response.headers.append(
      "Set-Cookie",
      oauthCookieHeader(DRIVE_CODE_VERIFIER_COOKIE, codeVerifier, secure),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
