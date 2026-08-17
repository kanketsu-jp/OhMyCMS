import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * **表示モードで「値を文字として見せる」ための器。**
 *
 * 規約: `knowledge/decisions/action-button-and-edit-mode.md` §2-1（design 2026-08-16・案 2）。
 * ```
 * text / url / password / textarea … 要素を残して `read-only:` のまま
 *                                     （🚨 なぞって選択・コピーできるため）
 * 🔴 checkbox / radio / select / color … **要素を置き換えて、値を文字で出す** ← ここで使う
 * ```
 *
 * 🚨 **`<p>` のまま。`<div>` にしない。** 文字として**選択・コピーできる**必要がある
 * （`components/ui/input.tsx` が `<input>` を残しているのと同じ理由）。
 *
 * 🚨 **高さを欄と揃えるのは必須。** 揃えないと、モードを切り替えるたびに**行が飛ぶ**。
 * `h-` ではなく **`min-h-`** を使う。理由は 2 つ:
 * - **値が空でも高さが潰れない**（`&nbsp;` で埋めない。**空白文字は読み上げに乗る**）
 * - **長い値で切れない**（`h-` だと 1 行に押し込まれる）
 *
 * 🚨 **`disabled` にした部品を置かないこと。** `disabled` は**焦点が当たらない**ので、
 * キーボードだけで読む人が値に到達できない（**見える／押せる／読み上げられる は別の問い**）。
 */
export function FieldValue({
  children,
  adornment,
  className,
  ...props
}: React.ComponentProps<"p"> & {
  /**
   * 値の左に添える印（色の見本など）。
   *
   * 🚨 **必ず `aria-hidden` で包まれる。** 読み上げは**値のほう**に乗せる
   * （見本を読み上げても「四角」としか言えず、値の情報は増えない）。
   */
  adornment?: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc-field)",
        // 🚨 **欄の境界を出す**（DESIGN.md §1-8）。堀池さん（2026-08-17 原文）:
        //    「**フィールドの枠がないので、わからない。**」
        //    「未入力のフィールドは背景色がないため分かりにくいです」
        //    実測（2026-08-17・表示モードの /admin/settings 3 枚）: 同じ画面の中で
        //      <Input readOnly> … bg muted/40 ・ px 12px  → 境界が分かる
        //      <FieldValue>     … bg 透明     ・ px 0px   → 🚨 境界が無い
        //    が **並んでいた**（FieldValue の欄 計 7 件）。
        // 🚨 **値は `input.tsx` の `read-only:` と同じものを使う**（新しい値を作らない）。
        //    2 通りの見た目を作ると、次に片方だけ直したとき見た目が割れる。
        // 🚨 **呼び出し側でなく、ここに置く。** 同じ問題を input/textarea は共有部品側で解いており
        //    （`input.tsx`「prop を増やさず read-only: 修飾子で見た目を切り替える（付け忘れが起きない）」）、
        //    ここだけ呼び出し側に置くと、次に FieldValue を使う人が必ず忘れる。
        // 🚨 角丸は付けない（§1-1「フラットに」）。枠は透明のまま＝ 地の色で示す。
        "border border-transparent bg-muted/40 px-3",
        className,
      )}
      {...props}
    >
      {adornment ? (
        <span aria-hidden="true" className="flex shrink-0 items-center">
          {adornment}
        </span>
      ) : null}
      {children}
    </p>
  );
}
