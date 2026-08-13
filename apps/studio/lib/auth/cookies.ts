export const SESSION_COOKIE = "session";
export const SETUP_COOKIE = "ohmycms_setup";
export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_CODE_VERIFIER_COOKIE = "google_oauth_code_verifier";

type SameSite = "lax" | "strict" | "none";

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSite;
  path?: string;
  maxAge?: number;
  expires?: Date;
};

const DEFAULT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false,
  sameSite: "lax" as const,
  path: "/",
};

/**
 * この要求が本当に HTTPS で来ているか。**Cookie の Secure はこれで決める。**
 *
 * 🚨 `NODE_ENV === "production"` で決めてはいけない（2026-08-13 実事故）。
 *    本番ビルドを**平文 HTTP の LAN アドレス**（`http://192.168.1.14:3101`）で開くと、
 *    **ブラウザが Secure 付き Cookie を1つも保存しません**。実測:
 *      `http://localhost:3101`    → Cookie を保持する（localhost は例外的に安全な文脈）
 *      `http://192.168.1.14:3101` → **保持した Cookie は 0 件**
 *    症状は「ログインは 200 なのに、次の画面で弾かれる」。オーナーがこれで入れなくなった。
 *
 * 🚨 HTTPS で配信しているときは必ず `true` になること（下げてよいのは平文のときだけ）。
 *    リバースプロキシ越しは `x-forwarded-proto` を見る。
 */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() === "https";
  }
  return new URL(request.url).protocol === "https:";
}

export function parseCookies(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) {
      continue;
    }

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) {
      continue;
    }

    cookies.set(name, decodeURIComponent(value));
  }

  return cookies;
}

export function cookieHeader(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  const merged = { ...DEFAULT_COOKIE_OPTIONS, ...options };
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (merged.maxAge !== undefined) {
    parts.push(`Max-Age=${merged.maxAge}`);
  }
  if (merged.expires) {
    parts.push(`Expires=${merged.expires.toUTCString()}`);
  }
  if (merged.path) {
    parts.push(`Path=${merged.path}`);
  }
  if (merged.httpOnly) {
    parts.push("HttpOnly");
  }
  if (merged.secure) {
    parts.push("Secure");
  }
  if (merged.sameSite) {
    parts.push(`SameSite=${merged.sameSite[0].toUpperCase()}${merged.sameSite.slice(1)}`);
  }

  return parts.join("; ");
}

export function deleteCookieHeader(name: string): string {
  return cookieHeader(name, "", {
    maxAge: 0,
    expires: new Date(0),
  });
}

export function sessionCookieHeader(token: string, maxAge: number, secure = false): string {
  return cookieHeader(SESSION_COOKIE, token, { maxAge, secure });
}

export function setupCookieHeader(token: string, maxAge: number, secure = false): string {
  return cookieHeader(SETUP_COOKIE, token, { maxAge, secure });
}

export function oauthCookieHeader(name: string, value: string, secure = false): string {
  return cookieHeader(name, value, { maxAge: 600, secure });
}
