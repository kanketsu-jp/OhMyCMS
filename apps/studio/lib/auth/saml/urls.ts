/**
 * SAML で IdP へ渡す URL（SP の Entity ID / ACS URL）の組み立て。
 *
 * 🚨 **スキームを `NODE_ENV` で決めてはいけない。**
 *    `knowledge/decisions/https-is-not-node-env.md` / `lib/auth/cookies.ts` の `isSecureRequest`。
 *    本番ビルドを平文 HTTP の LAN アドレスで配ることは普通にある。
 *    ここを間違えると **IdP が返す先が実在しない URL になり、ログインが必ず失敗する**
 *    （しかも失敗するのは IdP 側なので、こちらのログには何も出ない）。
 *
 * 🚨 `new URL(request.url).origin` を使わない理由:
 *    リバースプロキシ越しだと**内部のホスト名**（`studio:3000` など）になり、
 *    IdP から到達できない URL を渡してしまう。`x-forwarded-*` を見る必要がある。
 */

import { isSecureRequest } from "../cookies";

/**
 * 外から見たこのアプリの起点 URL。
 *
 * 解決順:
 *   1. `OHMYCMS_PUBLIC_URL`（明示。プロキシが `x-forwarded-*` を付けない構成のための逃げ道）
 *   2. `x-forwarded-proto` + `x-forwarded-host`（プロキシ越し）
 *   3. `host` ヘッダ + `isSecureRequest`
 *   4. `request.url`（最後の手段）
 */
export function publicBaseUrl(request: Request): string {
  const configured = process.env.OHMYCMS_PUBLIC_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const scheme = isSecureRequest(request) ? "https" : "http";
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (host) {
    return `${scheme}://${host}`;
  }

  return new URL(request.url).origin;
}

/** SAML 応答の受け口（Assertion Consumer Service）。IdP にはこの URL を登録してもらう。 */
export function acsUrl(request: Request): string {
  return `${publicBaseUrl(request)}/api/auth/saml/acs`;
}

/** SP メタデータの URL。Entity ID の既定値でもある。 */
export function metadataUrl(request: Request): string {
  return `${publicBaseUrl(request)}/api/auth/saml/metadata`;
}
