"use client";

import { usePageTrail } from "@/components/admin/page-trail";
import { useT } from "@/i18n/client";

/**
 * 画面の `<h1>`。**読み上げ専用**（`sr-only`）。
 *
 * 🚨 **なぜ見えない見出しなのか。**
 *   画面名は既に**パンくず**（ヘッダ）に出ている。同じ言葉を本文の先頭にもう一度置くと、
 *   `decisions/every-element-must-earn-its-place` に反する（同じことを 2 回言う要素は場所を得ていない）。
 *   一方で **`<h1>` が 1 つも無い画面は、読み上げで「いまどこを開いているか」が言えない**。
 *   ＝ **見せずに、名乗る**。既に `admin/profile/page.tsx` がこの形を採っていたので、それに合わせた。
 *
 * 🚨 **1 画面に 1 つだけ置くこと。** ここは `(admin)/layout.tsx` の `<main>` の先頭で 1 回だけ呼ぶ。
 *   各ページが自前の `<h1>` を足すと 2 つになる（読み上げで画面名が 2 回読まれる）。
 *   見える見出しが要る画面は **`<h2>` から始める**（`admin/trash/page.tsx` がその形）。
 *
 * 🚨 **パンくずと同じ言葉を、同じ出どころ（`usePageTrail`）から取る。**
 *   別々に組み立てると、片方だけ直したときに食い違う。
 *   🚨 パンくずは幅の都合で `shorten()` して表示するが、**ここは省略しない**
 *   （読み上げは幅に困らない。省略した名前を読ませる理由が無い）。
 *
 * ## 🚨 葉だけでは足りない（2026-08-17）
 *
 * 【測った】`/admin/collections/acc_748015_pl` と `/admin/content/acc_748015_pl` を並べたら、
 * **h1・パンくず・`<title>` の 3 つとも `acc_748015_pl` / 「OhMyCMS」で同一**だった。
 * ＝ **どちらの区画に居るか、画面のどこにも出ていなかった**（URL と左サイドバーの色だけ）。
 *
 * → **葉だけでなく、道筋の途中（区画）も名乗る。**
 *   🚨 **葉を先に出す**。理由は 2 つ:
 *     ① 読み上げで見出しへ飛んだ人が、**最初に聞くのはそのページの名前**であってほしい
 *     ② 🚨 **ブラウザのタブは右から切れる**ので、後ろに置いた名前は消える
 *
 * ## 🚨 `<title>`（タブの名前）は、ここでは直せなかった
 *
 * 【測った】9 ルートを引いて **9/9 が「OhMyCMS」**（種類の数 = 1）。
 * 🟢 対照 存在しないルートは「404: This page could not be found.」＝ 取り出し方は動いていた。
 * ＝ **タブを 10 枚開くと全部同じ名前**。履歴もブックマークも見分けが付かない。**未解決**。
 *
 * 🔴 **ここから直そうとして、2 通り試して 2 通りとも負けた**（2026-08-17・実測）:
 *   ① `useEffect` で `document.title` を書く
 *      → 配られた JS に `document.title =` は在るのに、**タイトルは変わらない**
 *        ＝ **Next のメタデータが後から上書きしている**（こちらが先に負ける）
 *   ② React 19 の `<title>` を描いて `<head>` へ持ち上げさせる
 *      → 🚨 **`<title>` が 3 つになり**（Next の 1 つ ＋ こちらの 2 つ）、
 *        **ブラウザは最初の 1 つ＝ Next のものを使う**。`document.title` は「OhMyCMS」のまま
 *
 * ＝ **正しい直し方は Next のメタデータ（`generateMetadata`）側**だが、
 *   **47 ルートに散る**うえ、名前の出どころが `page-meta.ts` と二重になる。
 *   🚨 **動かない仕組みを置いておくと「直っている」と読まれる**ので、**入れずに残した**。
 *   **次に触る人へ: これは未着手ではなく、2 通り試して落とした跡**。
 */
export function PageHeading({ brand }: { brand: string }) {
  const t = useT("nav");
  const crumbs = usePageTrail(brand);

  const current = crumbs[crumbs.length - 1];
  // 🚨 先頭（ブランド）と葉を除いた真ん中が「区画」。`/admin` 自身では空になる。
  const context = crumbs.slice(1, -1).map((crumb) => crumb.label).join(" / ");
  const heading = current?.label
    ? context
      ? t("page_title_with_context").replace("{name}", current.label).replace("{context}", context)
      : current.label
    : "";

  // 🚨 道筋が取れないとき（`crumbs` が空）は**何も出さない**。
  //   その場合この画面には `<h1>` が無いことになるので、
  //   受入 #3 の「見出し無し」で必ず気づける（黙って空の `<h1>` を置くと、
  //   **見出しが在るのに中身が無い**という、いちばん見つけにくい形になる）。
  if (!heading) return null;
  return <h1 className="sr-only">{heading}</h1>;
}
