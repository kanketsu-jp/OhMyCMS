import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { requireAdminAccess, type PermissionAction } from "@/lib/permissions/resolve";
import { getTables } from "@/lib/schema/introspect";
import { ApiError } from "@/lib/schema/errors";

const actions = new Set<PermissionAction>(["read", "create", "update", "delete"]);

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  parent: string | null;
};

type PolicyRow = {
  id: string;
  name: string;
  description: string | null;
  ip_access: string | null;
  app_access: boolean;
  admin_access: boolean;
  enforce_tfa: boolean;
};

type PermissionRow = {
  id: number;
  policy: string;
  collection: string;
  action: PermissionAction;
  permissions: unknown;
  validation: unknown;
  presets: unknown;
  fields: string | null;
};

type AccessRow = {
  id: string;
  role: string | null;
  user: string | null;
  policy: string;
  sort: number | null;
  role_name?: string | null;
  user_email?: string | null;
  policy_name?: string | null;
};

export async function requireAdmin(actor: Actor): Promise<void> {
  await requireAdminAccess(actor);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function optionalString(body: Record<string, unknown>, key: string): string | null | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_FIELD", `${key} は文字列で指定してください`);
  }
  return value.trim() === "" ? null : value.trim();
}

export function requiredString(body: Record<string, unknown>, key: string): string {
  const value = optionalString(body, key);
  if (!value) {
    throw new ApiError(400, "INVALID_FIELD", `${key} は必須です`);
  }
  return value;
}

function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ApiError(400, "INVALID_FIELD", `${key} はbooleanで指定してください`);
  }
  return value;
}

function parseAction(value: unknown): PermissionAction {
  if (typeof value !== "string" || !actions.has(value as PermissionAction)) {
    throw new ApiError(400, "INVALID_ACTION", "action は read/create/update/delete のいずれかで指定してください");
  }
  return value as PermissionAction;
}

export function parseJsonValue(value: unknown, key: string): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new ApiError(400, "INVALID_JSON", `${key} は正しいJSONで指定してください`);
    }
  }
  if (isRecord(value) || Array.isArray(value) || typeof value === "boolean" || typeof value === "number") {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      throw new ApiError(400, "INVALID_JSON", `${key} は正しいJSONで指定してください`);
    }
  }
  throw new ApiError(400, "INVALID_JSON", `${key} は正しいJSONで指定してください`);
}

async function ensureCollectionExists(collection: string): Promise<void> {
  const tables = await getTables();
  if (!tables.includes(collection)) {
    throw new ApiError(400, "COLLECTION_NOT_FOUND", "存在しないコレクションです");
  }
}

async function ensureRoleExists(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const row = await db("directus_roles").select("id").where({ id }).first();
  if (!row) {
    throw new ApiError(400, "ROLE_NOT_FOUND", "ロールが見つかりません");
  }
}

async function ensurePolicyExists(id: string): Promise<void> {
  const row = await db("directus_policies").select("id").where({ id }).first();
  if (!row) {
    throw new ApiError(400, "POLICY_NOT_FOUND", "ポリシーが見つかりません");
  }
}

async function ensureUserExists(id: string): Promise<void> {
  const row = await db("directus_users").select("id").where({ id }).first();
  if (!row) {
    throw new ApiError(400, "USER_NOT_FOUND", "ユーザーが見つかりません");
  }
}

export async function assertRoleParentDoesNotCycle(roleId: string, parent: string | null): Promise<void> {
  if (!parent) return;
  let current: string | null = parent;
  const seen = new Set<string>();

  while (current) {
    if (current === roleId) {
      throw new ApiError(400, "ROLE_PARENT_CYCLE", "親ロールに循環は作れません");
    }
    if (seen.has(current)) {
      throw new ApiError(400, "ROLE_PARENT_CYCLE", "親ロールに循環は作れません");
    }
    seen.add(current);
    const row: { parent: string | null } | undefined = await db("directus_roles")
      .select("parent")
      .where({ id: current })
      .first();
    current = row?.parent ?? null;
  }
}

export async function listRoles(): Promise<RoleRow[]> {
  return db<RoleRow>("directus_roles").select("*").orderBy("name");
}

export async function createRole(body: Record<string, unknown>): Promise<RoleRow> {
  const parent = optionalString(body, "parent") ?? null;
  await ensureRoleExists(parent);
  const [row] = await db<RoleRow>("directus_roles")
    .insert({
      id: randomUUID(),
      name: requiredString(body, "name"),
      description: optionalString(body, "description") ?? null,
      parent,
    })
    .returning("*");
  return row;
}

export async function getRole(id: string): Promise<RoleRow> {
  const row = await db<RoleRow>("directus_roles").where({ id }).first();
  if (!row) throw new ApiError(404, "ROLE_NOT_FOUND", "ロールが見つかりません");
  return row;
}

export async function updateRole(id: string, body: Record<string, unknown>): Promise<RoleRow> {
  await getRole(id);
  const update: Partial<RoleRow> = {};
  if ("name" in body) update.name = requiredString(body, "name");
  if ("description" in body) update.description = optionalString(body, "description") ?? null;
  if ("parent" in body) {
    const parent = optionalString(body, "parent") ?? null;
    await ensureRoleExists(parent);
    await assertRoleParentDoesNotCycle(id, parent);
    update.parent = parent;
  }
  const [row] = await db<RoleRow>("directus_roles").where({ id }).update(update).returning("*");
  return row;
}

export async function deleteRole(id: string): Promise<void> {
  const deleted = await db<RoleRow>("directus_roles").where({ id }).delete();
  if (!deleted) throw new ApiError(404, "ROLE_NOT_FOUND", "ロールが見つかりません");
}

export async function listPolicies(): Promise<PolicyRow[]> {
  return db<PolicyRow>("directus_policies").select("*").orderBy("name");
}

export async function createPolicy(body: Record<string, unknown>): Promise<PolicyRow> {
  const [row] = await db<PolicyRow>("directus_policies")
    .insert({
      id: randomUUID(),
      name: requiredString(body, "name"),
      description: optionalString(body, "description") ?? null,
      ip_access: optionalString(body, "ip_access") ?? null,
      app_access: optionalBoolean(body, "app_access") ?? true,
      admin_access: optionalBoolean(body, "admin_access") ?? false,
      enforce_tfa: optionalBoolean(body, "enforce_tfa") ?? false,
    })
    .returning("*");
  return row;
}

export async function getPolicy(id: string): Promise<PolicyRow> {
  const row = await db<PolicyRow>("directus_policies").where({ id }).first();
  if (!row) throw new ApiError(404, "POLICY_NOT_FOUND", "ポリシーが見つかりません");
  return row;
}

export async function updatePolicy(id: string, body: Record<string, unknown>): Promise<PolicyRow> {
  await getPolicy(id);
  const update: Partial<PolicyRow> = {};
  if ("name" in body) update.name = requiredString(body, "name");
  if ("description" in body) update.description = optionalString(body, "description") ?? null;
  if ("ip_access" in body) update.ip_access = optionalString(body, "ip_access") ?? null;
  if ("app_access" in body) update.app_access = optionalBoolean(body, "app_access");
  if ("admin_access" in body) update.admin_access = optionalBoolean(body, "admin_access");
  if ("enforce_tfa" in body) update.enforce_tfa = optionalBoolean(body, "enforce_tfa");
  const [row] = await db<PolicyRow>("directus_policies").where({ id }).update(update).returning("*");
  return row;
}

export async function deletePolicy(id: string): Promise<void> {
  const deleted = await db<PolicyRow>("directus_policies").where({ id }).delete();
  if (!deleted) throw new ApiError(404, "POLICY_NOT_FOUND", "ポリシーが見つかりません");
}

export async function listPermissions(policy?: string | null): Promise<PermissionRow[]> {
  const query = db<PermissionRow>("directus_permissions").select("*").orderBy("id");
  if (policy) query.where({ policy });
  return query;
}

export async function createPermission(body: Record<string, unknown>): Promise<PermissionRow> {
  const policy = requiredString(body, "policy");
  const collection = requiredString(body, "collection");
  await ensurePolicyExists(policy);
  await ensureCollectionExists(collection);
  const [row] = await db<PermissionRow>("directus_permissions")
    .insert({
      policy,
      collection,
      action: parseAction(body.action),
      permissions: parseJsonValue(body.permissions, "permissions"),
      validation: parseJsonValue(body.validation, "validation"),
      presets: parseJsonValue(body.presets, "presets"),
      fields: optionalString(body, "fields") ?? null,
    })
    .returning("*");
  return row;
}

export async function getPermission(id: string): Promise<PermissionRow> {
  const row = await db<PermissionRow>("directus_permissions").where({ id: Number(id) }).first();
  if (!row) throw new ApiError(404, "PERMISSION_NOT_FOUND", "permission行が見つかりません");
  return row;
}

export async function updatePermission(id: string, body: Record<string, unknown>): Promise<PermissionRow> {
  await getPermission(id);
  const update: Partial<PermissionRow> = {};
  if ("policy" in body) {
    update.policy = requiredString(body, "policy");
    await ensurePolicyExists(update.policy);
  }
  if ("collection" in body) {
    update.collection = requiredString(body, "collection");
    await ensureCollectionExists(update.collection);
  }
  if ("action" in body) update.action = parseAction(body.action);
  if ("permissions" in body) update.permissions = parseJsonValue(body.permissions, "permissions");
  if ("validation" in body) update.validation = parseJsonValue(body.validation, "validation");
  if ("presets" in body) update.presets = parseJsonValue(body.presets, "presets");
  if ("fields" in body) update.fields = optionalString(body, "fields") ?? null;
  const [row] = await db<PermissionRow>("directus_permissions")
    .where({ id: Number(id) })
    .update(update)
    .returning("*");
  return row;
}

export async function deletePermission(id: string): Promise<void> {
  const deleted = await db<PermissionRow>("directus_permissions").where({ id: Number(id) }).delete();
  if (!deleted) throw new ApiError(404, "PERMISSION_NOT_FOUND", "permission行が見つかりません");
}

function parseAccessTarget(body: Record<string, unknown>): { role: string | null; user: string | null } {
  const role = optionalString(body, "role") ?? null;
  const user = optionalString(body, "user") ?? null;
  if ((role && user) || (!role && !user)) {
    throw new ApiError(400, "INVALID_ACCESS_TARGET", "role と user はどちらか一方だけ指定してください");
  }
  return { role, user };
}

export async function listAccess(): Promise<AccessRow[]> {
  return db("directus_access")
    .leftJoin("directus_roles", "directus_access.role", "directus_roles.id")
    .leftJoin("directus_users", "directus_access.user", "directus_users.id")
    .leftJoin("directus_policies", "directus_access.policy", "directus_policies.id")
    .select<AccessRow[]>([
      "directus_access.id",
      "directus_access.role",
      "directus_access.user",
      "directus_access.policy",
      "directus_access.sort",
      { role_name: "directus_roles.name" },
      { user_email: "directus_users.email" },
      { policy_name: "directus_policies.name" },
    ])
    .orderBy("directus_access.sort", "asc")
    .orderBy("directus_access.id", "asc");
}

export async function createAccess(body: Record<string, unknown>): Promise<AccessRow> {
  const policy = requiredString(body, "policy");
  const { role, user } = parseAccessTarget(body);
  await ensurePolicyExists(policy);
  await ensureRoleExists(role);
  if (user) await ensureUserExists(user);

  const [row] = await db<AccessRow>("directus_access")
    .insert({
      id: randomUUID(),
      role,
      user,
      policy,
      sort: null,
    })
    .returning("*");
  return row;
}

export async function deleteAccess(id: string): Promise<void> {
  const deleted = await db<AccessRow>("directus_access").where({ id }).delete();
  if (!deleted) throw new ApiError(404, "ACCESS_NOT_FOUND", "ポリシー割り当てが見つかりません");
}
