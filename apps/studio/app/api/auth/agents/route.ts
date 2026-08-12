import { randomUUID } from "node:crypto";
import { requireHumanActor } from "@/lib/auth/context";
import { randomToken, sha256Hex } from "@/lib/auth/crypto";
import { db } from "@/lib/db/knex";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

type AgentRow = {
  id: string;
  name: string;
  on_behalf_of: string;
  tenant_scope: unknown;
  capabilities: unknown;
  origin: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "INVALID_AGENT_BODY", `${key} は必須です`);
  }
  return value.trim();
}

function requireExpiresInDays(body: Record<string, unknown>): number {
  const value = body.expires_in_days;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 365) {
    throw new ApiError(
      400,
      "INVALID_AGENT_EXPIRATION",
      "expires_in_days は 1 から 365 の整数で指定してください",
    );
  }
  return value;
}

function agentResponse(row: AgentRow) {
  return {
    id: row.id,
    name: row.name,
    on_behalf_of: row.on_behalf_of,
    tenant_scope: row.tenant_scope,
    capabilities: row.capabilities,
    origin: row.origin,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const actor = await requireHumanActor(request);
    const rows = await db<AgentRow>("agent_principals")
      .select(
        "id",
        "name",
        "on_behalf_of",
        "tenant_scope",
        "capabilities",
        "origin",
        "expires_at",
        "revoked_at",
        "created_at",
      )
      .where("on_behalf_of", actor.userId)
      .orderBy("created_at", "desc");

    return ok({ data: rows.map(agentResponse) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireHumanActor(request);
    const body = await readJsonObject(request);
    const name = requireString(body, "name");
    const expiresInDays = requireExpiresInDays(body);
    const origin = body.origin === undefined ? null : requireString(body, "origin");
    const token = randomToken(32);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
    const id = randomUUID();

    const [row] = await db("agent_principals")
      .insert({
        id,
        name,
        on_behalf_of: actor.userId,
        tenant_scope: body.tenant_scope ?? null,
        capabilities: body.capabilities ?? null,
        token_hash: sha256Hex(token),
        origin,
        expires_at: expiresAt,
        revoked_at: null,
        created_at: now,
      })
      .returning<AgentRow[]>([
        "id",
        "name",
        "on_behalf_of",
        "tenant_scope",
        "capabilities",
        "origin",
        "expires_at",
        "revoked_at",
        "created_at",
      ]);

    return ok({ data: agentResponse(row), token });
  } catch (error) {
    return errorResponse(error);
  }
}
