import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/knex";
import { asJsonObject } from "@/lib/auth/json-object";
import { sha256Hex, randomToken } from "./crypto";
import type { GoogleIdentity } from "./google";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionIssueResult = {
  rawToken: string;
  maxAge: number;
  expires: Date;
};

type DirectusUserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string | null;
  status: string;
};

type ExistingGoogleUserRow = DirectusUserRow & {
  auth_data: unknown;
};

export async function upsertGoogleUser(identity: GoogleIdentity): Promise<DirectusUserRow> {
  const existing = await db<ExistingGoogleUserRow>("directus_users")
    .select("id", "first_name", "last_name", "email", "role", "status", "auth_data")
    .where("provider", "google")
    .where("external_identifier", identity.sub)
    .first();

  if (existing) {
    await db("directus_users")
      .where("id", existing.id)
      .update({
        last_access: db.fn.now(),
        auth_data: {
          ...asJsonObject(existing.auth_data),
          email_verified: identity.emailVerified,
          picture: identity.picture,
        },
      });

    return existing;
  }

  const id = randomUUID();
  const user = {
    id,
    first_name: identity.firstName,
    last_name: identity.lastName,
    email: identity.email,
    password: null,
    status: "active",
    role: null,
    token: null,
    last_access: db.fn.now(),
    provider: "google",
    external_identifier: identity.sub,
    auth_data: { email_verified: identity.emailVerified, picture: identity.picture },
  };

  await db("directus_users").insert(user);

  return {
    id,
    first_name: identity.firstName,
    last_name: identity.lastName,
    email: identity.email,
    role: null,
    status: "active",
  };
}

// そのセッションがどの経路で作られたか。SSO専用へ切り替えた時に何を切るかの判断材料になる。
// setup（初期設定パスワード1つで入る経路）と password（利用者のパスワード）は別物として区別する。
// onboarding（初期設定を終えた直後に発行される経路）も password/setup とは別に分ける。
export type AuthMethod = "password" | "otp" | "google" | "saml" | "setup" | "onboarding" | "dev";

// 🚨 第3引数(authMethod)は省略可にしない。省略可にすると渡し忘れた呼び出し元が黙って null を記録し、
// 「どの経路で作られたか」を後から集計できなくなる。必須にすることで tsc が渡し忘れを検出する。
export async function issueSession(
  userId: string,
  request: Request,
  authMethod: AuthMethod,
): Promise<SessionIssueResult> {
  const rawToken = randomToken(32);
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await db("directus_sessions").insert({
    token: sha256Hex(rawToken),
    user: userId,
    expires,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: request.headers.get("user-agent"),
    data: null,
    origin: new URL(request.url).origin,
    next_token: null,
    auth_method: authMethod,
  });

  return {
    rawToken,
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires,
  };
}
