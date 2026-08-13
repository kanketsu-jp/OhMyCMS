"use client";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useFormat, useT } from "@/i18n/client";

type Props = {
  /** いま何ページ目か（1 始まり） */
  page: number;
  /** 次のページがあるか。総件数ではなく「1件多く取れたか」で判定する（pagination-href.ts の splitPage） */
  hasNext: boolean;
  /** 前のページの URL。1ページ目なら null */
  prevHref: string | null;
  /** 次のページの URL。次が無ければ null */
  nextHref: string | null;
};

/**
 * 一覧のページ送り。**13箇所すべてがこれを通す**（憲章 §4「例外なくページネーション」）。
 *
 * 🚨 総件数は出さない。`COUNT(*)` を撃たずに済ませるため、出せるのは
 * 「いま何ページ目か」と「次があるか」だけ。全ページ数が要る画面が出てきたら、
 * そのときに**その画面だけ**件数を数える（全画面に COUNT を配らない）。
 *
 * 1ページに収まりきる一覧では**何も描かない**。空の器を置くと面が1段増える（§1）。
 */
export function ListPagination({ page, hasNext, prevHref, nextHref }: Props) {
  const t = useT("common");
  const format = useFormat();
  if (page <= 1 && !hasNext) {
    return null;
  }
  return (
    <Pagination className="justify-between sm:justify-center">
      <PaginationContent className="w-full justify-between sm:w-auto sm:gap-2">
        <PaginationItem>
          {prevHref ? (
            <PaginationPrevious href={prevHref} />
          ) : (
            <PaginationPrevious aria-disabled className="pointer-events-none opacity-40" />
          )}
        </PaginationItem>
        <PaginationItem className="text-sm text-muted-foreground tabular-nums">
          {t("pagination_page", { page: format.number(page) })}
        </PaginationItem>
        <PaginationItem>
          {nextHref ? (
            <PaginationNext href={nextHref} />
          ) : (
            <PaginationNext aria-disabled className="pointer-events-none opacity-40" />
          )}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
