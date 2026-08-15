"use client";

import { useRouter } from "next/navigation";
import { EllipsisIcon, SlashIcon } from "lucide-react";

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
    // 🚨 **ここに `flex-1` を足さないこと。**（**守り手: 無し＝これは願望**。足しても何も止めない）
    //    一度足して、design の実測で外した（2026-08-15）。
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
                  {/* 🚨 読み上げ名は「上の階層へ ＋ ページ名」になる。
                      見えている文字（ページ名）を必ず含むので WCAG 2.5.3 を満たす。
                      `aria-label` でボタン全体に名前を付けると**見えている文字を打ち消す**ので使わない。
                      🚨 **守り手: 無し＝これは願望。しかも破っても画面から見えない**（読み上げ名だけが静かに壊れる）。
                      **ここだけは検査を足す価値がある**（他の約束は破れば画面で分かる）。 */}
                  <span className="sr-only">{t("nav.breadcrumb_parents")}</span>
                  <EllipsisIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  {/* 🚨 区切りのスラッシュ（堀池・2026-08-15「パンクズは『.../ページ名』にして」/「薄くする」）。
                      🚨 **薄いのは経路の記号だけ。ページ名は薄くしない**（いま居る場所は読ませる）。
                      `...` が**上の階層の省略**であることは、区切りがあって初めて伝わる
                      （隣り合っているだけだと、2つの別々のものに見える）。
                      🚨 **文字ではなくアイコン**（堀池・2026-08-15「どちらもアイコンを使う。ellipsis slash」）。
                      アイコンなら文字として読まれないが、`aria-hidden` も併せて付ける（確実にするため）。
                      🚨 **ボタンの中に置く**。外に出すと押せる範囲が2つに割れて見える。 */}
                  <SlashIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
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
            {/* 🚨 **上の階層が無いときは、押せる見た目にしない**（ボタンにも secondary にもしない）。
                押しても開くものが無いのに「押せる」と見せると、堀池さんの指示
                （「押下できることがわかるように」）と逆になる。スラッシュも出さない。

                🚨 **この分岐は 2026-08-15 時点で画面から到達できない**（実測）。
                道筋の根は必ず `/admin`（＝ブランド名）が積まれるので、道筋が 1 件になるのは
                `/admin` そのものだけで、**`/admin` は `/admin/collections` へ転送される**。
                それでも残すのは、**これが「思いつきの備え」ではなく、道筋が 1 件のときの
                正しい振る舞い**だから。消すと、開くものが無いのにボタンを出すことになる。
                （転送をやめた時・`/admin` 以外でパンくずを使った時に、そのまま表に出る） */}
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
