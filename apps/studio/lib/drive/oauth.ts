import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "@/lib/schema/errors";

/**
 * Google ドライブへ繋ぐための OAuth（**PKCE のみ。クライアントの秘密鍵を持たない**）。
 *
 * 🚨 **なぜ secret を持たないか**（2026-08-15 決定・設問105）:
 *   クライアントの秘密鍵を配ると、**セルフホストする各テナントの手元にそれが置かれる**。
 *   Installed App（デスクトップアプリ）型では **secret は秘密として成立しない**
 *   （配布物に含まれてしまう）ので、**最初から持たない PKCE** が正しい。
 *   → クライアントは **Installed App 型**で作る。`client_id` だけを設定として持つ。
 *
 * 🚨 **依存を足していない**。Google の OAuth もドライブも REST なので、`fetch` と
 *   Node 標準の `crypto` で足りる（`googleapis` を入れない）。
 *
 * 🚨 **`code_verifier` は一度きりの値**。ログ・レスポンス・DB に残さない。
 *   認可からコールバックまでの間だけ、HttpOnly Cookie で持ち回る（route 側の責任）。
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** 取り込みに要る範囲だけ。**書き込み権限は求めない**（読んで複製するだけなので）。 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export type PkcePair = {
  /** 🚨 サーバ側だけで持つ。外へ出さない。 */
  codeVerifier: string;
  /** 認可 URL に載せる。これは公開されてよい（verifier のハッシュなので戻せない）。 */
  codeChallenge: string;
};

/**
 * PKCE の対を作る。
 * RFC 7636: verifier は 43〜128 文字の unreserved 文字。challenge は S256 の base64url。
 */
export function createPkcePair(): PkcePair {
  // 32 バイト → base64url で 43 文字。下限ちょうどで、余計に長くしない。
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function authorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_SCOPE);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // 🚨 CSRF 対策。コールバックで必ず突き合わせる（照合しないなら付ける意味がない）。
  url.searchParams.set("state", input.state);
  // refresh_token を受け取るのに要る。offline でないと1時間で使えなくなる。
  url.searchParams.set("access_type", "offline");
  // 🚨 既に同意済みだと refresh_token が返らないことがある。取り込みには必須なので明示する。
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export type TokenResponse = {
  accessToken: string;
  /** 初回の交換でだけ返る。2回目以降は返らないので、返ったときだけ保存する。 */
  refreshToken: string | null;
  scope: string;
  expiresInSeconds: number;
};

/**
 * トークンの応答を読む。
 * 🚨 **失敗しても中身を投げ直さない**。Google のエラー応答には送った値が混ざることがあり、
 *   そのまま `console.error(..., error)` されると**秘密がログに出る**（2026-08-14 に S3 で
 *   同じ事故があった）。ここでは **error の識別子だけ**を通す。
 */
async function readTokenResponse(response: Response): Promise<TokenResponse> {
  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; scope?: string; expires_in?: number; error?: string }
    | null;

  if (!response.ok || !payload?.access_token) {
    // Google が返す `error` は "invalid_grant" のような**識別子**で、値を含まない。
    const code = typeof payload?.error === "string" ? payload.error : "unknown_error";
    throw new ApiError(502, "DRIVE_OAUTH_FAILED", `ドライブとの接続に失敗しました (${code})`);
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    scope: payload.scope ?? DRIVE_SCOPE,
    expiresInSeconds: payload.expires_in ?? 3600,
  };
}

/**
 * 認可コードをトークンに交換する。
 * 🚨 **クライアントの秘密鍵を送らない**。PKCE の `code_verifier` が本人確認の代わりになる。
 */
export async function exchangeCode(input: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  return readTokenResponse(response);
}

/**
 * リフレッシュトークンからアクセストークンを作り直す。
 * 🚨 ここでもクライアントの秘密鍵は送らない。
 */
export async function refreshAccessToken(input: {
  clientId: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  return readTokenResponse(response);
}
