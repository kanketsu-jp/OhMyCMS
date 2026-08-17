"use client";

import { useCallback } from "react";

import { useCollectionLabel } from "@/components/admin/collection-labels";
import type { Crumb } from "@/components/admin/page-trail";

/**
 * 道筋の 1 件を、**画面に出す名前**へ直す。
 *
 * 由来: 2026-08-17。schema(L5) がコレクションの表示名を配る契約
 * （`components/admin/collection-labels.tsx` / commit eb24c2d）を作り、
 * 司令塔が「**名前を作る側（schema）と、名前を出す側（header / shell）で切る**」と決めた。
 * ここは **出す側** の header(L3) が持つ変換。
 *
 * 🚨 **なぜ部品を 1 つ挟むのか。**
 *   使う所が `breadcrumbs.tsx` と `page-heading.tsx` の **2 つある**。
 *   両方に同じ条件を書くと、片方だけ直したときに
 *   **パンくずと見出しで名前が食い違う**（`page-trail.ts` の冒頭が
 *   「2 箇所で組み立てないこと」と言っているのと同じ理由）。
 *
 * ## 🚨 訳す対象を絞っている。その条件と、外れ方
 *
 * 訳すのは **「名前が URL の区間そのもの」の道筋だけ**。
 * `page-trail.ts` は、コレクションのように**名前が実データ側にあるページ**では
 * URL の区間をそのまま名前にする（`meta.titleFromData ? segment : t(...)`）。
 * ＝ **`crumb.label` が `crumb.href` の末尾と一致する**ものが、その形。
 *
 * 🚨 **全部に当てても壊れはしない**（対応表に無い識別子は
 *   `useCollectionLabel` がそのまま返すため）。それでも絞っているのは、
 *   **翻訳済みのページ名が、たまたまコレクションの識別子と同じだったとき**に
 *   別の名前へ化けるのを防ぐため。
 *
 * ## 🚨 Provider を載せても、**この hook を通っていない所は訳されない**
 *
 * 由来: 2026-08-17。私（header）は「マウント 1 手で画面が日本語になる」と書いたが、
 * shell(L1) の実測で**左サイドバーだけ変わらなかった**。
 * 理由は、左サイドバーが**サーバ側で `label: row.collection` を直に渡していた**ため
 * ——**hook を 1 度も通っていない**ので、Provider が在っても素通りする。
 * （直したのは shell。`fde4847` で対応表から引く形にした）
 *
 * 🚨 **「Provider を載せれば全部効く」ではない。** 名前を出す所を数え、
 * **その 1 つずつが hook を通っているか**を見ること。
 * 🚨 通っていない所の見え方は「**識別子のまま出る**」で、
 * Provider の付け忘れとも、下の条件外れとも**同じ顔**になる（3 つとも見分けが付かない）。
 *
 * 🚨 **この条件の外れ方（先に書いておく）**: 将来 `page-trail.ts` が
 *   データ由来の名前へ手を加える（前後の空白を落とす・大文字にする等）と、
 *   **末尾との一致が崩れて、翻訳が黙って止まる**。
 *   止まったときの見え方は「**識別子のまま出る**」なので、
 *   schema の但し書き（Provider の付け忘れ）と**同じ顔**になる。
 *   ＝ 識別子のまま出ていたら、**Provider と この条件の両方**を疑うこと。
 */
export function useCrumbLabel(): (crumb: Crumb) => string {
  const labelOf = useCollectionLabel();

  return useCallback(
    (crumb: Crumb) => {
      const segment = crumb.href.split("/").filter(Boolean).pop() ?? "";
      // 名前が URL の区間そのもの ＝ 実データ側に名前があるページ（コレクション等）
      if (segment === "" || crumb.label !== segment) return crumb.label;
      return labelOf(crumb.label);
    },
    [labelOf],
  );
}
