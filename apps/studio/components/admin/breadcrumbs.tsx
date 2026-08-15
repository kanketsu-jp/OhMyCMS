"use client";

import { useRouter } from "next/navigation";
import { EllipsisIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
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
    // 🚨 **ここに `flex-1` を足さないこと。** 一度足して、design の実測で外した（2026-08-15）。
    //    「SP でパンくずが潰れる」の対策として提案されていたが、**1 変更ずつ戻して測ると 1 件も減らなかった**:
    //      両方とも修正前                → 幅0 が 4 件
    //      breadcrumbs の flex-1 のみ    → 幅0 が 4 件（**変わらない**）
    //      page-action のみ              → 幅0 が 0 件
    //    真因は `babb715` で修正済み——`#header-primary-action` が SP でも出ていて、
    //    PC 用の文字ボタンが下部ナビと二重になり、**パンくずより先に幅を取っていた**。
    //    名前の長さは無関係（63 文字＝識別子の上限でも潰れ 0）。
    //    もし将来レイアウトの都合で `flex-1` が要るなら、**「潰れの対策ではない」と書いて足すこと**。
    <Breadcrumb aria-label={t("nav.breadcrumb_label")} className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1">
        {parents.length > 0 ? (
          <BreadcrumbItem className="min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-w-0"
                >
                  <EllipsisIcon aria-hidden="true" className="size-3.5" />
                  {/* 畳んだときに全体が読めるよう、元の名前を title に残す。 */}
                  <BreadcrumbPage title={current.label} className="block min-w-0 truncate">
                    {shorten(current.label)}
                  </BreadcrumbPage>
                </Button>
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
        ) : (
          <BreadcrumbItem className="min-w-0">
            {/* 畳んだときに全体が読めるよう、元の名前を title に残す。 */}
            <BreadcrumbPage title={current.label} className="truncate">
              {shorten(current.label)}
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
