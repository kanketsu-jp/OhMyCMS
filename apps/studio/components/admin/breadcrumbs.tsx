"use client";

import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePageTrail } from "@/components/admin/page-trail";
import { useT } from "@/i18n/client";

/**
 * ヘッダーのパンくず。**ページ名の置き場所はここだけ**になる。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「今のページのタイトル（１０文字以上は「...」で省略）のみで、
 * >   それより前のページは「├XXX」「└XXX」で表示させ、押下で戻る。」
 * > 「（ページ上部の見出しは）必要ない。理由はタイトルはパンクズで表示するのと、
 * >   その下の概要は『info』アイコンで説明する。」
 *
 * 道筋の組み立ては `page-trail.ts`（右サイドバーの見出しと**同じもの**を読む）。
 */

/** 現在地に出す文字数の上限。これを超えたら畳む。 */
const MAX_TITLE_LENGTH = 10;

function shorten(label: string): string {
  return label.length > MAX_TITLE_LENGTH
    ? `${label.slice(0, MAX_TITLE_LENGTH)}…`
    : label;
}

export function Breadcrumbs({ brand }: { brand: string }) {
  const t = useT();
  const router = useRouter();
  const crumbs = usePageTrail(brand);

  const current = crumbs[crumbs.length - 1];
  const parents = crumbs.slice(0, -1);

  if (!current) return null;

  return (
    <Breadcrumb aria-label={t("nav.breadcrumb_label")} className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1">
        {parents.length > 0 ? (
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("nav.breadcrumb_parents")}
                  // 🚨 **指で押せる大きさを持たせる**（憲章 §7 の 44px）。
                  //    アイコンは小さいままでよいが、**当たり判定は縦も横も 44px**にする。
                  //    `size-6`（24px）だと SP で押せない（design が14ページ分を実測）。
                  //    アイコンを大きくするのではなく、箱を広げるのが正しい。
                  className="flex min-h-(--control-h) min-w-(--control-h) items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:min-h-(--control-h-pc) md:min-w-(--control-h-pc)"
                >
                <ChevronDownIcon className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuGroup>
                  {parents.map((crumb, index) => (
                    <DropdownMenuItem
                      key={crumb.href}
                      onClick={() => router.push(crumb.href)}
                    >
                      {/* 木の枝の記号。最後（＝ひとつ上の階層）だけ └ にする。
                          記号なので辞書には載せない（文言ではない）。 */}
                      <span className="truncate">
                        {index === parents.length - 1 ? "└" : "├"}
                        {crumb.label}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
        ) : null}

        <BreadcrumbItem className="min-w-0">
          {/* 畳んだときに全体が読めるよう、元の名前を title に残す。 */}
          <BreadcrumbPage title={current.label} className="truncate">
            {shorten(current.label)}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
