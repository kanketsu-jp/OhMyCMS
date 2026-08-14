import { db } from "@/lib/db/knex";
import { ApiError } from "@/lib/schema/errors";
import { parseCookies, SESSION_COOKIE } from "./cookies";
import { sha256Hex } from "./crypto";

export type HumanActor = {
  type: "human";
  userId: string;
  email: string;
  role: string | null;
  picture: string | null;
  avatarEmoji: string | null;
};

export type AgentActor = {
  type: "agent";
  agentId: string;
  name: string;
  onBehalfOf: string;
  tenantScope: unknown;
  capabilities: unknown;
};

export type Actor = HumanActor | AgentActor;

type AgentPrincipalRow = {
  id: string;
  name: string;
  on_behalf_of: string;
  tenant_scope: unknown;
  capabilities: unknown;
};

type SessionUserRow = {
  user_id: string;
  email: string;
  role: string | null;
  auth_data: unknown;
  avatar_emoji: string | null;
};

function authDataPicture(value: unknown): string | null {
  if (typeof value === "string") {
    try {
      return authDataPicture(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const picture = (value as { picture?: unknown }).picture;
  return typeof picture === "string" ? picture : null;
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new ApiError(401, "INVALID_BEARER_TOKEN", "Bearer トークンが不正です");
  }

  return match[1];
}

async function resolveAgent(token: string): Promise<AgentActor> {
  const tokenHash = sha256Hex(token);
  const row = await db<AgentPrincipalRow>("agent_principals")
    .select("id", "name", "on_behalf_of", "tenant_scope", "capabilities")
    .where("token_hash", tokenHash)
    .whereNull("revoked_at")
    .where("expires_at", ">", db.fn.now())
    .first();

  if (!row) {
    throw new ApiError(401, "INVALID_AGENT_TOKEN", "エージェントトークンが無効です");
  }

  return {
    type: "agent",
    agentId: row.id,
    name: row.name,
    onBehalfOf: row.on_behalf_of,
    tenantScope: row.tenant_scope,
    capabilities: row.capabilities,
  };
}

async function resolveHuman(token: string): Promise<HumanActor> {
  const tokenHash = sha256Hex(token);
  const row = await db("directus_sessions")
    .join("directus_users", "directus_sessions.user", "directus_users.id")
    .select<SessionUserRow>({
      user_id: "directus_users.id",
      email: "directus_users.email",
      role: "directus_users.role",
      auth_data: "directus_users.auth_data",
      avatar_emoji: "directus_users.avatar_emoji",
    })
    .where("directus_sessions.token", tokenHash)
    .where("directus_sessions.expires", ">", db.fn.now())
    .first();

  if (!row) {
    throw new ApiError(401, "INVALID_SESSION", "セッションが無効です");
  }

  return {
    type: "human",
    userId: row.user_id,
    email: row.email,
    role: row.role,
    picture: authDataPicture(row.auth_data),
    avatarEmoji: row.avatar_emoji,
  };
}

export async function resolveActor(request: Request): Promise<Actor | null> {
  const bearer = bearerToken(request);
  if (bearer) {
    return resolveAgent(bearer);
  }

  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionToken = cookies.get(SESSION_COOKIE);
  if (!sessionToken) {
    return null;
  }

  return resolveHuman(sessionToken);
}

export async function requireActor(request: Request): Promise<Actor> {
  const actor = await resolveActor(request);
  if (!actor) {
    throw new ApiError(401, "UNAUTHENTICATED", "認証が必要です");
  }
  return actor;
}

export async function requireHumanActor(request: Request): Promise<HumanActor> {
  const actor = await requireActor(request);
  if (actor.type !== "human") {
    throw new ApiError(403, "HUMAN_AUTH_REQUIRED", "人間のセッション認証が必要です");
  }
  return actor;
}
