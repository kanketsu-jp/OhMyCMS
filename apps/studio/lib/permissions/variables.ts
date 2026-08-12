import type { Actor } from "@/lib/auth/context";

export type PermissionVariables = {
  currentUser: string;
  currentRole: string | null;
  now: string;
};

function replaceValue(value: unknown, variables: PermissionVariables): unknown {
  if (value === "$CURRENT_USER") return variables.currentUser;
  if (value === "$CURRENT_ROLE") return variables.currentRole;
  if (value === "$NOW") return variables.now;

  if (Array.isArray(value)) {
    return value.map((item) => replaceValue(item, variables));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        replaceValue(child, variables),
      ]),
    );
  }

  return value;
}

export function variablesForActor(
  actor: Actor,
  role: string | null,
  now = new Date(),
): PermissionVariables {
  return {
    currentUser: actor.type === "human" ? actor.userId : actor.onBehalfOf,
    currentRole: role,
    now: now.toISOString(),
  };
}

export function replacePermissionVariables<T>(
  value: T,
  variables: PermissionVariables,
): T {
  return replaceValue(value, variables) as T;
}
