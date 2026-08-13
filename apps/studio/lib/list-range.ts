import { ApiError } from "./schema/errors";

/**
 * 一覧の `limit` / `offset` を、URL のクエリ（文字列 or null）から安全な整数へ直す。
 *
 * 🚨 **一覧を返す関数は、例外なくこれを通す**（憲章 §4「全てのデータテーブルはページネーションを
 * つける。全件取得を書かない」）。上限を持たない一覧は、行が増えた日に必ず落ちる。
 *
 * 🚨 **`lib/` の掟に合わせて Next.js に依存しない**（AGENTS.md §3.6）。
 * 受け取るのは素の文字列で、`NextRequest` や `searchParams` をそのまま渡さないこと。
 *
 * 既定と上限は `lib/files/service.ts` の `parseList` に合わせてある
 * （2つの一覧で挙動が違うと、呼ぶ側が覚えられない）。
 */
export type ListRangeInput = {
  limit?: string | number | null;
  offset?: string | number | null;
};

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

function toNumber(value: string | number | null | undefined, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  return typeof value === "number" ? value : Number(value);
}

export function parseListRange(input: ListRangeInput = {}): {
  limit: number;
  offset: number;
} {
  const limit = toNumber(input.limit, DEFAULT_LIMIT);
  const offset = toNumber(input.offset, 0);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ApiError(400, "INVALID_LIMIT", `limitは1〜${MAX_LIMIT}の整数で指定してください`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ApiError(400, "INVALID_OFFSET", "offsetは0以上の整数で指定してください");
  }
  return { limit, offset };
}
