/**
 * SAML 応答の受け口（Assertion Consumer Service）。**認証の急所**。
 *
 * IdP は `POST` で `application/x-www-form-urlencoded` の `SAMLResponse`（base64）を送ってくる。
 *
 * 🚨 **ここへ来た時点では、送り主は誰でもありうる。**
 *    署名検証が通るまで、応答の中身を1つも信用しない（`lib/auth/saml/verify.ts` の5段）。
 *
 * 🚨 セッションの発行は**既にある `issueSession()` に乗せる**（引き継ぎ書 §3）。
 *    認証手段ごとにセッションの作り方を変えない。パスワード・OTP・SAML すべて同じ経路。
 */

import { isSecureRequest, sessionCookieHeader } from "@/lib/auth/cookies";
import { getSamlConfig } from "@/lib/auth/saml/config";
import { acsUrl, metadataUrl, safeRelativePath } from "@/lib/auth/saml/urls";
import { upsertSamlUser, verifySamlResponse } from "@/lib/auth/saml/verify";
import { issueSession } from "@/lib/auth/sessions";
import { errorResponse } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

/**
 * 🚨 `request.formData()` は**本文が無い / Content-Type が違う**だけで例外を投げる。
 *    そのまま落とすと `INTERNAL_ERROR` の 500 になり、
 *    **「壊れた入力」と「サーバの不具合」が区別できなくなる**（実測で踏んだ）。
 */
async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new ApiError(400, "SAML_MISSING_RESPONSE", "認証応答がありません");
  }
}

export async function POST(request: Request) {
  try {
    const form = await readForm(request);
    const samlResponse = form.get("SAMLResponse");
    if (typeof samlResponse !== "string" || !samlResponse) {
      throw new ApiError(400, "SAML_MISSING_RESPONSE", "認証応答がありません");
    }

    const config = await getSamlConfig();
    const identity = await verifySamlResponse(samlResponse, config, {
      spEntityId: config.spEntityId?.trim() || metadataUrl(request),
      acsUrl: acsUrl(request),
    });

    const user = await upsertSamlUser(identity);
    if (user.status !== "active") {
      // 🚨 IdP で認証できても、こちら側で止めている利用者は入れない。
      throw new ApiError(403, "USER_SUSPENDED", "この利用者は利用を停止されています");
    }

    const session = await issueSession(user.id, request);

    const response = new Response(null, {
      status: 302,
      headers: {
        // 🚨 IdP 経由で戻ってくる値なので、このサイトの中に限る（`safeRelativePath` に理由）。
        location: safeRelativePath(form.get("RelayState")),
        "cache-control": "no-store",
      },
    });
    response.headers.append(
      "Set-Cookie",
      // 🚨 `NODE_ENV` ではなく実際の通信路で Secure を決める（`lib/auth/cookies.ts`）。
      sessionCookieHeader(session.rawToken, session.maxAge, isSecureRequest(request)),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
