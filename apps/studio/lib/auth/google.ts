import { createRemoteJWKSet, jwtVerify } from "jose";
import { ApiError } from "@/lib/schema/errors";
import { sha256Base64Url } from "./crypto";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
};

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function requiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new ApiError(503, "OAUTH_NOT_CONFIGURED", `${name} が設定されていません`);
  }
  return value;
}

export function googleOAuthConfig(request: Request): GoogleOAuthConfig {
  const url = new URL(request.url);
  return {
    clientId: requiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: `${url.origin}/api/auth/google/callback`,
  };
}

export function googleAuthorizationUrl(
  config: GoogleOAuthConfig,
  state: string,
  codeVerifier: string,
): string {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", sha256Base64Url(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new ApiError(401, "GOOGLE_TOKEN_EXCHANGE_FAILED", "Google のコード交換に失敗しました");
  }

  const idToken = (payload as { id_token?: unknown }).id_token;
  if (typeof idToken !== "string") {
    throw new ApiError(401, "GOOGLE_ID_TOKEN_MISSING", "Google ID トークンがありません");
  }

  return idToken;
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    audience: clientId,
    issuer: GOOGLE_ISSUERS,
  });

  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    throw new ApiError(401, "GOOGLE_ID_TOKEN_EXPIRED", "Google ID トークンの期限が切れています");
  }

  if (payload.email_verified !== true) {
    throw new ApiError(401, "GOOGLE_EMAIL_NOT_VERIFIED", "Google メールアドレスが未確認です");
  }

  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new ApiError(401, "GOOGLE_ID_TOKEN_INVALID", "Google ID トークンが不正です");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: true,
    firstName: typeof payload.given_name === "string" ? payload.given_name : null,
    lastName: typeof payload.family_name === "string" ? payload.family_name : null,
  };
}
