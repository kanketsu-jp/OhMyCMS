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

  if (isSystemTableName(name)) {
    throw new ApiError(
      400,
      "SYSTEM_IDENTIFIER",
      `システムテーブル名は使用できません: ${name}`,
    );
  }
}

/**
 * システムテーブルか。ここに載っているものはコレクション一覧に出さず、
 * 同じ名前でユーザーがコレクションを作ることもできない。
 *
 * 🚨 `ohmycms_` は F2 で足した接頭辞（設定・通知・不具合報告）。
 *    ここへ入れ忘れると、**内部テーブルが管理画面のコンテンツ一覧に並び、
 *    設定を items API から直接書き換えられてしまう**（実際に一度そうなった）。
 *    **今後 `ohmycms_` で始まるテーブルを足すときは、この関数は触らなくてよい**が、
 *    別の接頭辞を使うなら必ずここに足すこと。
 */
export function isSystemTableName(name: string): boolean {
  return (
    name.startsWith("directus_") ||
    name.startsWith("knex_") ||
    name.startsWith("ohmycms_") ||
    name === "agent_principals"
  );
}

