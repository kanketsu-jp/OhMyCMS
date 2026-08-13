/**
 * ページ送りの URL を組み立てる。**Server Component から呼ぶ**ので `"use client"` を付けない
 * （付けると import した側に client 参照が渡ってしまい、サーバで呼べなくなる）。
 *
 * 憲章 §4「既定の件数を決め、URL に載せる（リロードで戻る・共有できる）」に従い、
 * ページ番号は必ずクエリに載せる。`page=1` だけは**書かない**（正規化して URL を1つに保つ）。
 */

/** 一覧の既定件数。表は 20 行、画像のグリッドは 24（4列×6行）にしている。 */
export const PAGE_SIZE = 20;
export const GRID_PAGE_SIZE = 24;

/** `?page=` を読む。壊れた値・0・負数はすべて 1 に倒す。 */
export function currentPage(raw: string | undefined | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * いま見ている URL の他のクエリ（絞り込みなど）を保ったまま、ページだけ差し替えた URL を返す。
 * 🚨 絞り込みを落とすと「2ページ目に行ったらフィルタが外れる」になるので、必ず引き継ぐ。
 */
export function pageHref(
  pathname: string,
  query: Record<string, string | string[] | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "page" || value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one !== "") params.append(key, one);
    }
  }
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * 「次のページがあるか」を、`COUNT(*)` を撃たずに判定するための取り方。
 *
 * 🚨 総件数は要らない。**1件多く取って、多かったら次がある**とだけ分かればよい
 * （憲章 §4「総件数の取得も安くする。COUNT(*) が重いなら『次がある』判定だけにする」）。
 * 返す配列は余分の1件を切り落としてあるので、そのまま描いてよい。
 */
export function splitPage<T>(rows: T[], size: number): { rows: T[]; hasNext: boolean } {
  return rows.length > size
    ? { rows: rows.slice(0, size), hasNext: true }
    : { rows, hasNext: false };
}
