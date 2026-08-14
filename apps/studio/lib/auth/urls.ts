/**
 * 認証まわりで共通に使う URL の扱い。
 *
 * 🚨 契約 `AGENTS.md §3.6`: ここは `next/*` を import しない（将来 Hono へ切り出す資産）。
 *
 * 🚨 **ここは SAML 専用ではない。** 元は `lib/auth/saml/urls.ts` に置いていたが、
 *    **戻り先を外から受け取るのは SAML だけとは限らない**（OTP・パスワード・OAuth に
 *    `?next=` を足す日が来る）。SAML の下に隠れていると、次に書く人が存在に気づかず、
 *    **また正規表現で書いて抜かれる**（実際に 3 通り抜かれた。下記）。
 */

import { isSecureRequest } from "./cookies";

/**
 * 外から見たこのアプリの起点 URL。
 *
 * 🚨 **スキームを `NODE_ENV` で決めてはいけない**
 *    （`knowledge/decisions/https-is-not-node-env.md`）。
 *    本番ビルドを平文 HTTP の LAN アドレスで配ることは普通にある。
 *
 * 🚨 `new URL(request.url).origin` を使わない理由:
 *    リバースプロキシ越しだと**内部のホスト名**（`studio:3000` など）になり、
 *    **外から到達できない URL** を外部サービスへ渡してしまう。`x-forwarded-*` を見る必要がある。
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

/**
 * 内部の自己呼び出し(サーバ側から自分の /api/* を fetch する)用のオリジン。
 *
 * プロキシ配下では `request.url` が `https://0.0.0.0:PORT/...` 等の到達不能な値になるため、
 * その場合はループバック(http)＋実際の待受ポートへ向ける。直アクセス/devではプロキシヘッダが
 * 無いため、従来どおり `request.url` の origin を使う。
 */
export function internalOrigin(request: Request): string {
  const behindProxy =
    request.headers.get("x-forwarded-host") || request.headers.get("x-forwarded-proto");
  if (behindProxy) return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
  return new URL(request.url).origin;
}

/**
 * 🚨 **外から受け取った「戻り先」は、必ずこれを通すこと。**
 *    `?next=` / `?redirect=` / SAML の `RelayState` / OAuth の `state` に載せたパス——
 *    **利用者以外が値を決められる経路はすべて対象**。
 *
 * ── なぜ正規表現で判定しないか（実測で 3 通り抜けた）──
 *
 * `/^\/(?!\/)[^\s]*$/`（「`/` で始まり `//` でない」）は、次を**すべて通す**:
 *
 *     "/\evil.com"     → ブラウザは http://evil.com/ へ行く
 *                        （特別なスキームでは "\" が "/" として解釈される）
 *     "/\/evil.com"    → 同上
 *     "/..//evil.com"  → 正規化されて "//evil.com" になり、別サイトへ出る
 *
 * 🚨 **形を数え上げる方式は、知らない書き方が1つでもあれば穴になる。**
 *    そして**知らない書き方は、定義上、思いつけない**。
 *    だから**形を見るのをやめ、`new URL()` で解決して結果を見る**
 *    （ブラウザと同じ規則で解決するので、**ブラウザが行く先とずれない**）。
 *    `knowledge/decisions/verify-the-verifier.md`「代理を測らない」。
 *
 * @param raw 外から来た値。文字列でなくても安全に落ちる
 * @param fallback 受け取れないときの戻り先。**必ずこのサイト内の固定パスにすること**
 */
export function safeRelativePath(raw: unknown, fallback = "/admin"): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  // 🚨 制御文字はコードポイントで書く。生の制御文字をソースへ入れると、
  //    見た目は同じでもツールによって化ける（実測で2回踏んだ）。
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
  // 正規化の結果が "//" で始まると、Location ヘッダとしては別サイトを指す。
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
