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

/**
 * ログイン後に戻る先を、**このサイトの中に限る**（オープンリダイレクト防止）。
 *
 * 🚨 この値は **IdP を経由して戻ってくる**（RelayState）。
 *    つまり**攻撃者が中身を決められる**ので、`/` で始まるかどうかだけでは足りない。
 *
 * 🚨 **正規表現で「`/` で始まり `//` でない」を見るのは穴がある**（実測で3通り抜けた）:
 *
 *      "/\\evil.com"    → ブラウザは **http://evil.com/** へ飛ぶ
 *                          （特別なスキームでは `\` が `/` として解釈される）
 *      "/\\/evil.com"   → 同上
 *      "/..//evil.com"  → 正規化されて "//evil.com" になり、別サイトへ出る
 *                          （🚨 ここを `**` で囲まないこと。`*` の直後の `/` が
 *                            このコメントの終端になり、以降がコードとして解釈される）
 *
 *    どれも「`/` で始まり、2文字目が `/` ではない」を満たす。
 *    **形を見るのをやめて、解決した結果を見る**のが確実。
 */
export function safeRelativePath(raw: unknown, fallback = "/admin"): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  // 制御文字・空白は受け取らない（ヘッダ分割や、除去されてから解釈されるのを防ぐ）。
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) return fallback;
  if (!raw.startsWith("/")) return fallback;

  // 🚨 実際に解決してから確かめる。基準の URL は判定用で、結果には使わない。
  const base = "http://localhost";
  let resolved: URL;
  try {
    resolved = new URL(raw, base);
  } catch {
    return fallback;
  }
  if (resolved.origin !== base) return fallback;

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  // 正規化の結果が `//` で始まると、Location ヘッダとしては別サイトを指す。
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
