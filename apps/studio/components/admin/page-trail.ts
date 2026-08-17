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

export type Crumb = {
  href: string;
  label: string;
  /**
   * 押せるか。**押せない区画も道筋には出す**（`/admin/content` / `/admin/settings`）。
   * 🚨 既定は `true`。**`false` を無視して `<Link>` にすると 404 になる**。
   */
  navigable: boolean;
};

/**
 * パスから道筋を組み立てる。
 *
 * 🚨 **実在しない中間パスは「押させない」。ただし名前は出す**（2026-08-17 に反転）。
 *    `/admin/settings` や `/admin/content` にはページが無い（`app/(admin)/` に `page.tsx` が無い）ので、
 *    **リンクにすると「押すと 404」になる**。判定は `pageMeta()` の `navigable` に任せる。
 *
 *    🔴 **以前はここで名前ごと落としていた。それが誤りだった。**
 *      実測 2026-08-17: `/admin/collections/<名前>` と `/admin/content/<名前>` が
 *      **h1・パンくず・`<title>` の 3 つとも同一**になり、
 *      **どちらの区画に居るか画面から分からなかった**。
 *      ＝ 「**押せない**」と「**名前が無い**」を同じ扱いにしていた。
 *      **次に触る人へ: `navigable: false` の区間を、また捨てないこと。**
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
      crumbs.push({ href, label: brand, navigable: true });
      return;
    }

    const meta = pageMeta(href);
    if (!meta) {
      if (isCurrent) crumbs.push({ href, label: segment, navigable: true });
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
      // 🚨 **名前は出すが、ページが無ければ押させない**（`page-meta.ts` の `navigable`）。
      navigable: meta.navigable !== false,
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
