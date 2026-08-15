import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import type { FilterObject } from "@/lib/items/filter";
import { ApiError } from "@/lib/schema/errors";
import { replacePermissionVariables, variablesForActor } from "./variables";

export type PermissionAction = "read" | "create" | "update" | "delete" | "log";
export type AdminCapability =
  | "schema:read" | "schema:write" | "settings:read" | "settings:write";

export type PermissionResolution = {
  allowed: boolean;
  allowedFields: string[] | "*";
  rowFilter: FilterObject | null;
  admin: boolean;
};

type UserPrincipal = {
  userId: string;
  role: string | null;
};

type PermissionRow = {
  permissions: unknown;
  fields: string | null;
};

type Capabilities = {
  collections?: Record<string, unknown>;
};

const DENIED: PermissionResolution = {
  allowed: false,
  allowedFields: [],
  rowFilter: null,
  admin: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFields(value: string | null): string[] | "*" {
  if (!value) return [];
  const fields = value
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  return fields.includes("*") ? "*" : fields;
}

function unionFields(rows: PermissionRow[]): string[] | "*" {
  const fields = new Set<string>();

  for (const row of rows) {
    const parsed = parseFields(row.fields);
    if (parsed === "*") return "*";
    for (const field of parsed) fields.add(field);
  }

  return Array.from(fields);
}

function asFilter(value: unknown): FilterObject | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new ApiError(500, "INVALID_PERMISSION_FILTER", "権限フィルタが不正です");
  }
  return value;
}

function composeOr(filters: FilterObject[]): FilterObject | null {
  if (filters.length === 0) return null;
  if (filters.length === 1) return filters[0] ?? null;
  return { _or: filters };
}

function composeAnd(filters: Array<FilterObject | null | undefined>): FilterObject | null {
  const present = filters.filter((filter): filter is FilterObject => Boolean(filter));
  if (present.length === 0) return null;
  if (present.length === 1) return present[0] ?? null;
  return { _and: present };
}

async function principalForActor(actor: Actor): Promise<UserPrincipal> {
  if (actor.type === "human") {
    return { userId: actor.userId, role: actor.role };
  }

  const row = await db("directus_users")
    .select<{ id: string; role: string | null }>({ id: "id", role: "role" })
    .where("id", actor.onBehalfOf)
    .first();

  if (!row) {
    throw new ApiError(401, "DELEGATED_USER_NOT_FOUND", "委任元ユーザーが見つかりません");
  }

  return { userId: row.id, role: row.role };
}

async function roleHierarchy(role: string | null): Promise<string[]> {
  const roles: string[] = [];
  const seen = new Set<string>();
  let current = role;

  while (current && !seen.has(current)) {
    roles.push(current);
    seen.add(current);

    const row = await db("directus_roles")
      .select<{ parent: string | null }>({ parent: "parent" })
      .where("id", current)
      .first();

    current = row?.parent ?? null;
  }

  return roles;
}

async function policyIdsForPrincipal(principal: UserPrincipal): Promise<string[]> {
  const roles = await roleHierarchy(principal.role);
  const ids = new Set<string>();

  if (roles.length > 0) {
    const roleRows = await db("directus_access")
      .select<{ policy: string }[]>({ policy: "policy" })
      .whereIn("role", roles);
    for (const row of roleRows) ids.add(row.policy);
  }

  const userRows = await db("directus_access")
    .select<{ policy: string }[]>({ policy: "policy" })
    .where("user", principal.userId);
  for (const row of userRows) ids.add(row.policy);

  return Array.from(ids);
}

async function hasAdminAccess(policyIds: string[]): Promise<boolean> {
  if (policyIds.length === 0) return false;
  const row = await db("directus_policies")
    .select<{ id: string }>({ id: "id" })
    .whereIn("id", policyIds)
    .where("admin_access", true)
    .first();
  return Boolean(row);
}

function capabilityAllows(
  capabilities: unknown,
  collection: string,
  action: PermissionAction,
): boolean {
  if (capabilities === null || capabilities === undefined) return true;
  if (!isRecord(capabilities)) return false;

  const collections = (capabilities as Capabilities).collections;
  if (!isRecord(collections)) return false;

  const actions = collections[collection];
  return Array.isArray(actions) && actions.includes(action);
}

/**
 * 管理系 capability の判定。
 * コレクション単位の capabilityAllows とは既定が「逆」であることに注意。
 *   - capabilityAllows(collections):    capabilities が null/undefined → true（委任元の権限をそのまま継承）
 *   - capabilityAllowsAdmin(admin):     capabilities が null/undefined → false（管理操作は既定で不許可）
 * 理由: 管理操作はスキーマ破壊・権限昇格に直結するため、明示的に委譲されたときだけ許す。
 */
function capabilityAllowsAdmin(capabilities: unknown, capability: AdminCapability): boolean {
  if (capabilities === null || capabilities === undefined) return false;
  if (!isRecord(capabilities)) return false;

  const admin = (capabilities as { admin?: unknown }).admin;
  return Array.isArray(admin) && admin.includes(capability);
}

function tenantScopeFilter(actor: Actor): FilterObject | null {
  if (actor.type !== "agent") return null;
  if (actor.tenantScope === null || actor.tenantScope === undefined) return null;
  if (!isRecord(actor.tenantScope)) {
    throw new ApiError(403, "INVALID_TENANT_SCOPE", "エージェントのtenantScopeが不正です");
  }
  return actor.tenantScope;
}

export async function resolvePermission(
  actor: Actor,
  collection: string,
  action: PermissionAction,
): Promise<PermissionResolution> {
  if (actor.type === "agent" && !capabilityAllows(actor.capabilities, collection, action)) {
    return DENIED;
  }

  const principal = await principalForActor(actor);
  const policyIds = await policyIdsForPrincipal(principal);

  if (await hasAdminAccess(policyIds)) {
    const tenantScope = tenantScopeFilter(actor);
    return {
      allowed: true,
      allowedFields: "*",
      rowFilter: tenantScope,
      admin: true,
    };
  }

  if (policyIds.length === 0) return DENIED;

  const rows = await db<PermissionRow>("directus_permissions")
    .select("permissions", "fields")
    .whereIn("policy", policyIds)
    .where("collection", collection)
    .where("action", action);

  if (rows.length === 0) return DENIED;

  const variables = variablesForActor(actor, principal.role);
  const hasUnfilteredRow = rows.some((row) => row.permissions === null || row.permissions === undefined);
  const policyFilter = hasUnfilteredRow
    ? null
    : composeOr(
        rows
          .map((row) => asFilter(replacePermissionVariables(row.permissions, variables)))
          .filter((filter): filter is FilterObject => Boolean(filter)),
      );
  const tenantScope = replacePermissionVariables(tenantScopeFilter(actor), variables);

  return {
    allowed: true,
    allowedFields: unionFields(rows),
    rowFilter: composeAnd([policyFilter, tenantScope]),
    admin: false,
  };
}

export async function actorHasAdminAccess(actor: Actor): Promise<boolean> {
  const principal = await principalForActor(actor);
  const policyIds = await policyIdsForPrincipal(principal);
  return hasAdminAccess(policyIds);
}

export async function requireAdminAccess(actor: Actor, capability: AdminCapability): Promise<void> {
  if (actor.type === "agent" && !capabilityAllowsAdmin(actor.capabilities, capability)) {
    throw new ApiError(403, "CAPABILITY_DENIED", "このcapabilityでは管理操作が許可されていません");
  }
  if (!(await actorHasAdminAccess(actor))) {
    throw new ApiError(403, "ADMIN_ACCESS_REQUIRED", "管理者権限が必要です");
  }
}
