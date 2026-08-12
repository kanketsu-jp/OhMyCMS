import { randomUUID } from "node:crypto";
import { sessionCookieHeader } from "@/lib/auth/cookies";
import { issueSession } from "@/lib/auth/sessions";
import { db } from "@/lib/db/knex";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

if (
  process.env.NODE_ENV !== "production" &&
  process.env.ALLOW_DEV_LOGIN === "true"
) {
  console.warn(
    "警告: 開発用ログインが有効です。ALLOW_DEV_LOGIN=true は本番で絶対に設定しないでください。",
  );
}

type UserRow = {
  id: string;
  email: string;
  status: string;
};

type PolicyRow = {
  id: string;
};

function isEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "true";
}

async function readEmail(request: Request): Promise<string> {
  const body = await request.json().catch(() => null) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "INVALID_BODY", "JSONオブジェクトを指定してください");
  }

  const email = (body as Record<string, unknown>).email;
  if (typeof email !== "string" || !email.includes("@")) {
    throw new ApiError(400, "INVALID_EMAIL", "emailを指定してください");
  }

  return email.trim().toLowerCase();
}

async function upsertDevUser(email: string): Promise<UserRow> {
  const existing = await db<UserRow>("directus_users")
    .select("id", "email", "status")
    .where({ email })
    .first();

  if (existing) {
    await db("directus_users")
      .where({ id: existing.id })
      .update({ status: "active", last_access: db.fn.now() });
    return { ...existing, status: "active" };
  }

  const id = randomUUID();
  await db("directus_users").insert({
    id,
    first_name: null,
    last_name: null,
    email,
    password: null,
    status: "active",
    role: null,
    token: null,
    last_access: db.fn.now(),
    provider: "dev",
    external_identifier: `dev:${email}`,
    auth_data: { source: "dev-login" },
  });

  return { id, email, status: "active" };
}

async function ensureDevAdminAccess(userId: string): Promise<void> {
  const existingPolicy = await db<PolicyRow>("directus_policies")
    .select("id")
    .where("name", "dev-admin")
    .first();

  const policyId = existingPolicy?.id ?? randomUUID();

  if (existingPolicy) {
    await db("directus_policies")
      .where({ id: policyId })
      .update({ admin_access: true, app_access: true });
  } else {
    await db("directus_policies").insert({
      id: policyId,
      name: "dev-admin",
      description: "開発用ログイン専用の管理者ポリシー",
      ip_access: null,
      app_access: true,
      admin_access: true,
      enforce_tfa: false,
    });
  }

  const existingAccess = await db("directus_access")
    .select("id")
    .where({ user: userId, policy: policyId })
    .first();

  if (!existingAccess) {
    await db("directus_access").insert({
      id: randomUUID(),
      user: userId,
      role: null,
      policy: policyId,
      sort: null,
    });
  }
}

export async function POST(request: Request) {
  try {
    // 本番では絶対に有効にしないこと。ALLOW_DEV_LOGIN=true はローカル検証専用。
    if (!isEnabled()) {
      return new Response(null, { status: 404 });
    }

    console.warn(
      "警告: 開発用ログインにアクセスしました。本番では絶対に有効にしないでください。",
    );

    const url = new URL(request.url);
    const email = await readEmail(request);
    const user = await upsertDevUser(email);

    if (url.searchParams.get("admin") === "true") {
      await ensureDevAdminAccess(user.id);
    }

    const session = await issueSession(user.id, request);
    const response = ok({ data: { type: "human", userId: user.id, email, role: null } });
    response.headers.append(
      "Set-Cookie",
      sessionCookieHeader(session.rawToken, session.maxAge),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
