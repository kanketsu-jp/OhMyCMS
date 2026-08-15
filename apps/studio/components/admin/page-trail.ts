"use client";

import { usePathname } from "next/navigation";

import { useT } from "@/i18n/client";
import { pageMeta } from "@/lib/admin/page-meta";

/**
 * 「いまどのページに居るか」の道筋。パンくずと右サイドバーの見出しが**同じものを読む**。
 *
 * 🚨 2箇所で組み立てないこと。片方だけ直すと、ヘッダーの名前と
 *    右サイドバーの見出しが食い違う（同じ画面の中で違う名前が2つ出る）。
 *
 * 🚨 ページ名の出所は `lib/admin/page-meta.ts` ただ1つ。ここでは名前を持たない。
 */

export type Crumb = { href: string; label: string };

/**
 * パスから道筋を組み立てる。
 *
 * 🚨 **実在しない中間パスは出さない。** `/admin/settings` や `/admin/content` には
 *    ページが無い（`app/(admin)/` に `page.tsx` が無い）。出すと「押すと 404」になる。
 *    判定は `pageMeta()` に任せる（ここでルート表を持たない）。
 *    **守り手: `pageMeta()` が定義の無いパスに `null` を返すこと**。
 *    🚨 ただし `pageMeta()` は「`PAGE_META` に載っているか」しか見ていない。
 *    **載っているのにページが消えた**場合は素通りする（この約束は完全ではない）。
 *
 * 🚨 現在地だけは、定義が無くても必ず出す。出さないと**画面に名前が1つも出ない**
 *    （ページ本文から見出しを消したので、名前の表示場所はここだけになった）。
 */
export function buildTrail(
  pathname: string,
  brand: string,
  t: (key: string) => string,
): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];

  segments.forEach((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const isCurrent = index === segments.length - 1;

    // 道筋の根はプロジェクト名。`/admin` は辞書ではなく**設定された名前**で呼ぶ。
    if (href === "/admin") {
      crumbs.push({ href, label: brand });
      return;
    }

    const meta = pageMeta(href);
    if (!meta) {
      if (isCurrent) crumbs.push({ href, label: segment });
      return;
    }

    // `titleFromData` は「名前は実データ側にある」という印。
    // レイアウトはそのデータを持たないので、URL の区間をそのまま名前にする
    // （コレクション名はそれ自体が名前なので、これで正しく出る）。
    // 🚨 **本タイトルがあればそれを使い、無ければ従来どおり `titleKey`**（`page-meta.ts` の `fullTitleKey`）。
    //    いまは `fullTitleKey` を持つページが 1 つも無いので、**この行を入れても画面は1文字も変わらない**。
    //    文言を足す作業と分けてあるのは、崩れたときにどちらが原因かを分けるため。
    crumbs.push({
      href,
      label: meta.titleFromData ? segment : t(meta.fullTitleKey ?? meta.titleKey),
    });
  });

  return crumbs;
}

/** いまのページの道筋。名前空間を付けない翻訳関数を使う（page-meta が完全なキーを持つため）。 */
export function usePageTrail(brand: string): Crumb[] {
  const t = useT();
  const pathname = usePathname();
  return buildTrail(pathname, brand, t);
}
