import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/knex";
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

export async function upsertGoogleUser(identity: GoogleIdentity): Promise<DirectusUserRow> {
  const existing = await db<DirectusUserRow>("directus_users")
    .select("id", "first_name", "last_name", "email", "role", "status")
    .where("provider", "google")
    .where("external_identifier", identity.sub)
    .first();

  if (existing) {
    await db("directus_users")
      .where("id", existing.id)
      .update({ last_access: db.fn.now() });

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
    auth_data: { email_verified: identity.emailVerified },
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

export async function issueSession(userId: string, request: Request): Promise<SessionIssueResult> {
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
  });

  return {
    rawToken,
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires,
  };
}
