export const SESSION_COOKIE = "session";
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
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

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

export function sessionCookieHeader(token: string, maxAge: number): string {
  return cookieHeader(SESSION_COOKIE, token, { maxAge });
}

export function oauthCookieHeader(name: string, value: string): string {
  return cookieHeader(name, value, { maxAge: 600 });
}
