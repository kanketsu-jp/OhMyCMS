/**
 * SSO でログインを始める（`/api/auth/saml/login`）。
 * AuthnRequest を組み立てて IdP へ 302 で送り出す。
 *
 * 🚨 **SAML が設定されていないときに 302 を返さない**（IdP の URL が空のまま飛ばすと
 *    利用者は真っ白なエラー画面に着く）。503 を返して**理由が分かる形**にする。
 */

import { getSamlConfig, isSamlUsable } from "@/lib/auth/saml/config";
import { createSamlClient, purgeExpiredSamlRecords, samlRequestSource } from "@/lib/auth/saml/client";
import { safeRelativePath } from "@/lib/auth/urls";
import { acsUrl, metadataUrl } from "@/lib/auth/saml/urls";
import { errorResponse } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const config = await getSamlConfig();
    if (!isSamlUsable(config)) {
      throw new ApiError(503, "SAML_NOT_CONFIGURED", "SSO が設定されていません");
    }

    await purgeExpiredSamlRecords();
    const client = createSamlClient(config, {
      spEntityId: config.spEntityId?.trim() || metadataUrl(request),
      acsUrl: acsUrl(request),
    }, samlRequestSource(request));

    // RelayState = ログイン後に戻る先。IdP を往復して ACS へ戻ってくる。
    // 🚨 **外部サイトへ飛ばせないように、このサイトの中に限る**（`safeRelativePath` に理由）。
    const relayState = safeRelativePath(new URL(request.url).searchParams.get("redirect"));

    const location = await client.getAuthorizeUrlAsync(relayState, undefined, {});

    return new Response(null, {
      status: 302,
      headers: { location, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
