import type { ItemsQuery } from "./types.js";

function csv(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(",") : (value as string);
}

/**
 * ItemsQuery を実際のクエリ文字列へ落とす。
 * filter / deep は JSON 文字列にする（API 側が JSON.parse する）。
 */
export function itemsQueryToParams(
  query: ItemsQuery | undefined,
): Record<string, string | number | undefined> {
  if (!query) return {};

  return {
    fields: csv(query.fields),
    filter: query.filter === undefined ? undefined : JSON.stringify(query.filter),
    sort: csv(query.sort),
    limit: query.limit,
    offset: query.offset,
    page: query.page,
    meta: csv(query.meta as string | readonly string[] | undefined),
    deep: query.deep === undefined ? undefined : JSON.stringify(query.deep),
  };
}
