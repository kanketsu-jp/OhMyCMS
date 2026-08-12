import { ApiError } from "./errors";

const RESERVED_WORDS = new Set([
  "select",
  "from",
  "where",
  "table",
  "column",
  "user",
  "order",
  "group",
  "limit",
  "offset",
  "join",
  "index",
  "primary",
  "key",
  "constraint",
  "default",
  "null",
  "not",
  "and",
  "or",
  "as",
  "on",
]);

export function assertSafeIdentifier(name: string): void {
  if (typeof name !== "string" || name.length < 1 || name.length > 63) {
    throw new ApiError(
      400,
      "INVALID_IDENTIFIER",
      "識別子は1〜63文字で指定してください",
    );
  }

  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new ApiError(
      400,
      "INVALID_IDENTIFIER",
      "識別子は小文字英字・数字・アンダースコアのみ使用できます",
    );
  }

  if (RESERVED_WORDS.has(name)) {
    throw new ApiError(
      400,
      "RESERVED_IDENTIFIER",
      `予約語は識別子に使用できません: ${name}`,
    );
  }

  if (
    name.startsWith("directus_") ||
    name.startsWith("knex_") ||
    name === "agent_principals"
  ) {
    throw new ApiError(
      400,
      "SYSTEM_IDENTIFIER",
      `システムテーブル名は使用できません: ${name}`,
    );
  }
}

export function isSystemTableName(name: string): boolean {
  return (
    name.startsWith("directus_") ||
    name.startsWith("knex_") ||
    name === "agent_principals"
  );
}

