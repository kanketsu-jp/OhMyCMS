import { requireActor } from "@/lib/auth/context";
import { deleteCookieHeader, parseCookies } from "@/lib/auth/cookies";
import {
  DRIVE_CODE_VERIFIER_COOKIE,
  DRIVE_STATE_COOKIE,
  driveOAuthConfig,
} from "@/lib/drive/config";
import { getAccountEmail } from "@/lib/drive/client";
import { exchangeCode } from "@/lib/drive/oauth";
import { saveConnection } from "@/lib/drive/tokens";
import { requireCapability } from "@/lib/permissions/resolve";
import { errorResponse } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

/**
 * Google からの戻り先。**ここが一番危ない口**なので、順に確かめてから交換する。
 *
 * 🚨 1. **ログイン済みか**（誰の接続として保存するかが決まる）
 * 🚨 2. **state が Cookie と一致するか**（CSRF。付けるだけで照合しないなら意味がない）
 * 🚨 3. **code_verifier が手元にあるか**（PKCE。無ければ交換できない）
 *
 * 🚨 **アクセストークンもリフレッシュトークンも、この関数の外へ返さない。**
 *    保存は `saveConnection` が暗号化して行い、画面へは「繋がった」だけを返す。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const actor = await requireActor(request);
    requireCapability(actor, "settings:write");
    const userId = actor.type === "human" ? actor.userId : actor.onBehalfOf;

    // Google 側で断られたとき（同意しなかった等）。**理由はそのまま画面へ出さない**。
    const denied = url.searchParams.get("error");
    if (denied) {
      throw new ApiError(400, "DRIVE_AUTH_DENIED", "Google ドライブとの連携が完了しませんでした");
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      throw new ApiError(400, "DRIVE_AUTH_INVALID", "連携の応答が不正です");
    }

    const cookies = parseCookies(request.headers.get("cookie"));
    const expectedState = cookies.get(DRIVE_STATE_COOKIE);
    const codeVerifier = cookies.get(DRIVE_CODE_VERIFIER_COOKIE);
    // 🚨 state を照合する。ここを飛ばすと、他人が仕込んだ認可を掴まされる。
    if (!expectedState || expectedState !== state) {
      throw new ApiError(400, "DRIVE_AUTH_INVALID", "連携の応答が不正です");
    }
    if (!codeVerifier) {
      throw new ApiError(400, "DRIVE_AUTH_INVALID", "連携の応答が不正です");
    }

    const config = await driveOAuthConfig(request);
    const token = await exchangeCode({
      clientId: config.clientId,
      code,
      codeVerifier,
      redirectUri: config.redirectUri,
    });

    // 🚨 refresh_token が無いと、1時間後に使えなくなる。**その場で失敗させる**
    //    （「繋がったのに翌日使えない」を後から気づくより良い）。
    if (!token.refreshToken) {
      throw new ApiError(
        502,
        "DRIVE_AUTH_INCOMPLETE",
        "連携に必要な情報が返りませんでした。一度連携を解除してからやり直してください",
      );
    }

    await saveConnection(userId, {
      refreshToken: token.refreshToken,
      scope: token.scope,
      // 🚨 取れなければ null。表示用の飾りなので、ここで連携を失敗させない。
      accountEmail: await getAccountEmail(token.accessToken),
    });

    const response = new Response(null, {
      status: 302,
      headers: { location: "/admin/files?notice=drive_connected" },
    });
    // 使い終わった一度きりの値は必ず消す。
    response.headers.append("Set-Cookie", deleteCookieHeader(DRIVE_STATE_COOKIE));
    response.headers.append("Set-Cookie", deleteCookieHeader(DRIVE_CODE_VERIFIER_COOKIE));
    return response;
  } catch (error) {
    // 失敗しても Cookie は消す（残すと次の試行が古い state で弾かれる）。
    const response = errorResponse(error);
    response.headers.append("Set-Cookie", deleteCookieHeader(DRIVE_STATE_COOKIE));
    response.headers.append("Set-Cookie", deleteCookieHeader(DRIVE_CODE_VERIFIER_COOKIE));
    return response;
  }
}
