"use client";

import { useEffect } from "react";

import { setPageMissing } from "@/lib/admin/page-missing";

/**
 * 「いま出ているのは『そのページは無い』の画面だ」を右サイドバーへ知らせるだけの部品。
 * **何も描かない。**
 *
 * 🚨 **置き場所は `NotFoundScreen` の中 1 箇所だけ。** 各ページに置くと、置き忘れた画面ができる。
 * 理由と実測は `lib/admin/page-missing.ts` の冒頭にまとめてある。
 *
 * 🚨 **外れたら必ず戻す**（`useEffect` の後始末）。戻さないと、そのあと普通の画面へ移ったときに
 * 説明が出なくなる。**「壊れていて出ない」と「出す物が無い」が同じ見た目になる。**
 */
export function MarkPageMissing() {
  useEffect(() => {
    setPageMissing(true);
    return () => setPageMissing(false);
  }, []);

  return null;
}
