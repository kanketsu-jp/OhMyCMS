"use client";

import { useSyncExternalStore } from "react";

/**
 * 「いま描かれているのは『そのページは無い』の画面か」を、右サイドバーへ知らせるための小さな外部ストア。
 *
 * ## 🚨 なぜ必要か（2026-08-17 実測）
 *
 * 右サイドバーの説明（`DESIGN.md` §1-11）は **経路だけ**で決まる（`lib/admin/page-meta.ts` を
 * `components/admin/page-info-panel.tsx` が引く）。**ページが「無い」を描いたことを知らない。**
 * その結果、**存在しないものの画面で、できないことを約束していた**:
 *
 * ```
 * /admin/content/zzz_no      主部「そのコレクションはありません」
 *                            🚨 概要「このコレクションの項目を一覧・検索し、開いて編集できます。」
 * /admin/collections/zzz_no  🚨 概要「このコレクションの項目（欄）と、他のコレクションとの関係を…」
 * /admin/content/<c>/<無い id> 🚨 概要「項目の内容を編集して保存します。…」
 * /admin/files/<無い id>      🚨 概要「このファイルの題・説明・タグ・置き場所を変えられます。」
 * /admin/reports/<無い id>    🚨 概要「この報告のやりとりです。返信を書けます。」
 * 🟢 対照 /admin/settings/roles/<無い id> … 概要なし（そのルートに descriptionKey が無いだけ）
 * 🟢 対照 /admin/zz-nope（どのルートにも当たらない）… 右パネルそのものが出ない
 * ```
 *
 * 🚨 **`notFound()` を呼んでも直らない。** `app/(admin)/not-found.tsx` は
 * **`(admin)` の layout の中**で描かれるので、右サイドバーは生きたまま・経路も変わらない
 * （実測: `/admin/reports/zz-not-an-id` は `notFound()` 済みなのに概要が出ていた）。
 *
 * ## 🚨 なぜ context ではなく外部ストアなのか
 *
 * 右サイドバーの中身は `{children}`（ページ）の **兄弟**として描かれる
 * （`components/admin/right-panel.tsx`）。**ページ側に Provider を置いても包めない。**
 * 同じ理由で `lib/admin/files-selection.ts` も外部ストアにしてある。**その形に揃えた。**
 *
 * ## 使い方
 *
 * 知らせる側は `NotFoundScreen` の 1 箇所だけ（`<MarkPageMissing />` を描く）。
 * **各ページには置かない**——置くと「知らせ忘れた画面」が生まれる。
 */

let missing = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 🚨 `NotFoundScreen` がマウントしているあいだだけ `true`。
 *
 * 立てっぱなしにしない（外れたら戻す）。戻さないと、そのあと普通の画面へ移ったときに
 * **説明が出なくなる**——「無い 0」と「異常が無い 0」を取り違えるのと同じ形になる。
 */
export function setPageMissing(next: boolean): void {
  if (missing === next) return;
  missing = next;
  emit();
}

export function usePageMissing(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => missing,
    // 🚨 サーバでは常に false。ここで true を返すと、描き始めの一瞬だけ説明が消えてちらつく。
    () => false,
  );
}
