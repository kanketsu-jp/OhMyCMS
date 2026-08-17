"use client";

import Link from "next/link";
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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tree, TreeItem } from "@/components/ui/tree";
import { useCrumbLabel } from "@/components/admin/crumb-label";
import { isRedirectOnlySection } from "@/components/admin/redirect-only-sections";
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
  const crumbs = usePageTrail(brand);
  // 🚨 コレクションの表示名を当てる（schema の契約 eb24c2d・司令塔の「出す側」の役）。
  //    条件と、翻訳が黙って止まる形は `crumb-label.ts` に書いてある。
  const labelOfCrumb = useCrumbLabel();

  const current = crumbs[crumbs.length - 1];
  const parents = crumbs.slice(0, -1);

  if (!current) return null;

  // 🚨 現在地の名前は **2 か所**で使う（畳んだ表示と、畳む前を残す `title`）。
  //    ここで 1 回だけ解いて両方へ渡す（別々に解くと、片方だけ識別子のまま残る）。
  const currentLabel = labelOfCrumb(current);

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
    // 🚨 **高さをヘッダーいっぱいまで通す**（`DESIGN.md` §2-6・堀池 2026-08-17 L1）。
    //    `h-full` は**間の器が 1 つでも伸びていないと効かない**ので、
    //    nav → ol → li の 3 段すべてに通す（実測: 通す前はここだけ 36px で、他は 55px だった）。
    //
    //    🚨 **これは私（header）の前の判断の反転**。2026-08-17 の C2 のとき、
    //    「56 にするとパンくずが枠付きの塊になって主操作より重く見える」と考えて**そのままにし**、
    //    司令塔も「いまのままで結構」と答えた。**そのあと L1 で角丸が消えて平らになり、
    //    §2-6 が規約として書かれた**ので、残す理由が無くなった。**経緯を消さずに残す。**
    <Breadcrumb aria-label={t("nav.breadcrumb_label")} className="flex min-w-0 items-stretch self-stretch">
      <BreadcrumbList className="flex-nowrap items-stretch gap-1">
        {parents.length > 0 ? (
          <BreadcrumbItem className="min-w-0 items-stretch">
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
                  <BreadcrumbPage title={currentLabel} className="block min-w-0 truncate">
                    {shorten(currentLabel)}
                  </BreadcrumbPage>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {/* 🚨 **罫線文字（├ └）をやめて、接続線そのものを描く**（堀池・2026-08-17・C4）。
                    原文:「パンくずリスト：現在の罫線はただの記号のようなので、デザインとして
                          あしらいを加えてください。以前お渡しした YouTube のチャット UI のように、
                          角丸の線で動的に変化するようなイメージにしてください。」

                    🚨 **これは堀池さん自身の前の指示の反転**（消さずに残す）。
                      2026-08-15 の原文は「それより前のページは『├XXX』『└XXX』で表示させ」だった。
                      2 日使ってみて「ただの記号」＝ 線に見えない、という判断に変わった。

                    🚨 **新しく描かない。既に在るものを繋ぐ。**【測った 2026-08-17】
                      規約 `knowledge/decisions/tree-connector-lines.md` が
                      「**罫線文字（├ └ ┣）を使わない**」を既に決めていて、
                      `components/ui/tree.tsx` と `app/globals.css` に実装まで在った。
                      🚨 それでも `TreeItem` の使用は **リポジトリ全体で 0 件**、
                      罫線文字が残っていたのは **このファイルだけ**（他 0 件）だった
                      ＝ **規約と部品が在って、繋がっていなかった**のがこの指摘の実体。

                    🚨 **平らな並びのまま置く**（入れ子にしない）。
                      `::before`（通し線）は `:last-child` で消えるので、
                      **途中の行＝ ├ / 最後の行＝ └** が、記号のときと 1 対 1 で対応する。
                      入れ子にすると段ごとに 1 件になり、通し線が 1 本も出なくなる
                      （＝ 記号のときの意味が変わる）。tree.tsx の実測も平らな並びで採られている。

                    🚨 `role="none"` は**外さないこと**。Radix の `DropdownMenuContent` は
                      `role="menu"` なので、素の `ul` / `li` を入れると
                      **メニューの中に「リスト」が現れて読み上げの構造が二重になる**。
                      見た目のための器なので、意味としては消しておく。 */}
                <Tree role="none">
                  {/* 🚨 **本物のリンク（`<a href>`）にする**（2026-08-15）。
                      以前は onClick でページを移していたが、`href` が無いと:
                        ・**Cmd+クリック / 中クリックで新しいタブに開けない**
                        ・読み上げで「リンク」ではなく「メニュー項目」として読まれる
                      `asChild` で `<a>` を項目そのものにすれば、**押した挙動は変えずに**両方直る。
                      🚨 `role="menuitem"` は Radix が `asChild` でも保つ（＝メニューの操作性は失わない）。
                      🚨 **このコメントを `map(... => (` の内側に置かないこと。**
                      返り値は 1 要素しか置けず、置いた瞬間に**構文エラーで全画面 500**になる（実際にやった）。 */}
                  {/* 🚨 **ページが無い区画は押させない**（`/admin/content` / `/admin/settings`）。
                      名前は道筋に出すが、`<Link>` にすると 404 になる（`page-trail.ts` の `navigable`）。
                      押せないものを `DropdownMenuItem` にすると**押せそうに見えて何も起きない**ので、
                      **項目にせず、見出しの行として置く**（`disabled` で薄くするのとは意味が違う——
                      これは「いま使えない」ではなく「**もともと行き先が無い**」）。 */}
                  {parents.map((crumb) => {
                    // 🚨 枝は **CSS が描く**（`li` の擬似要素）。ここでは印を付けるだけ。
                    //    どの行が └ になるかは `:last-child` が決めるので、
                    //    **添字で分岐しない**（分岐を 2 箇所に持つと、片方だけ直したときに割れる）。
                    // 🚨 **転送するだけの区画は押させない**（司令塔の決定・案 A の続き）。
                    //    押すと**無関係なコレクション**へ着く（`/admin/content` は最初の 1 つへ転送する）。
                    //    🚨 「もどる」だけ直して**ここを直さなかった**ので、
                    //      **もどるとパンくずで行き先が食い違っていた**（私が作った不整合）。
                    //    名前は出す。押せないだけ（`/admin/settings` と同じ扱い）。
                    if (!crumb.navigable || isRedirectOnlySection(crumb.href)) {
                      return (
                        <TreeItem key={crumb.href} role="none">
                          {/* 🚨 **ページが無い区画は押させない**（上の申し送りと同じ理由）。
                              行の高さは `tree-item` が持つので、縦の余白は指定しない
                              （指定すると肘の位置が行の中央からずれる）。 */}
                          <div className="flex items-center px-2 text-sm text-muted-foreground">
                            <span className="truncate">{labelOfCrumb(crumb)}</span>
                          </div>
                        </TreeItem>
                      );
                    }
                    return (
                      <TreeItem key={crumb.href} role="none">
                        <DropdownMenuItem asChild>
                          <Link href={crumb.href}>
                            <span className="truncate">{labelOfCrumb(crumb)}</span>
                          </Link>
                        </DropdownMenuItem>
                      </TreeItem>
                    );
                  })}
                </Tree>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
        ) : (
          <BreadcrumbItem className="min-w-0 items-stretch">
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
            <BreadcrumbPage title={currentLabel} className="truncate">
              {shorten(currentLabel)}
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
