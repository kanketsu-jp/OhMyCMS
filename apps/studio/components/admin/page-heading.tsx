"use client";

import { usePageTrail } from "@/components/admin/page-trail";

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
 * 🚨 道筋が取れないとき（`crumbs` が空）は**何も出さない**。
 *   その場合この画面には `<h1>` が無いことになるので、
 *   受入 #3 の「見出し無し」で必ず気づける（黙って空の `<h1>` を置くと、
 *   **見出しが在るのに中身が無い**という、いちばん見つけにくい形になる）。
 */
export function PageHeading({ brand }: { brand: string }) {
  const crumbs = usePageTrail(brand);
  const current = crumbs[crumbs.length - 1];
  if (!current?.label) return null;
  return <h1 className="sr-only">{current.label}</h1>;
}
