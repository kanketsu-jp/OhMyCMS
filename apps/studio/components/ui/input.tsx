"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"
import { useInsideSurface } from "@/components/ui/surface"

/**
 * 🚨 **面の中では罫線を外し、背景で区別する**（docs/design/surface-rules.md §2-2）。
 * 判定は自動。呼び出し側が意識する必要はない。
 * 余白は自分で持つ（入力欄の内側 padding は部品の責務）。
 */
/**
 * 🚨 `variant="entry"` は**入口の画面だけ**（ログイン・オンボーディング・SSO）。
 * 堀池（2026-08-15）:「パスワードを入れるだけなので、**もっと大きい入力フォームにして
 * 入力の敷居を極限まで無くす**。…**大きいと言っても極端に大きくないように**」
 * → 56px（`--control-h-entry`）。**操作が1つしかない画面に限る**。
 * 通常の画面で使うと、入力が複数あるのに1つだけ大きい＝優先度の嘘になる。
 */
function Input({
  className,
  type,
  // 🚨 `size` という名前は使わない。**`<input size>` はネイティブ属性**（文字数）で、
  //    型が number なので、props を素通しする側（input-group.tsx）でビルドが落ちる（実測）。
  variant = "default",
  ...props
}: React.ComponentProps<"input"> & { variant?: "default" | "entry" }) {
  const insideSurface = useInsideSurface()

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-inside-surface={insideSurface ? "true" : undefined}
      className={cn(
        // 高さは --control-h-*（app/globals.css）だけが決める。SP は指のために 44px。
        variant === "entry"
          ? "h-(--control-h-entry) px-4"
          : "h-(--control-h) md:h-(--control-h-pc-field)",
        "w-full min-w-0 rounded-lg bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-(--control-h-xs) file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-muted-foreground aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        insideSurface
          // 面の中: 罫線を持たず背景で区別する
          ? "bg-muted/60 disabled:bg-muted/40"
          // 面の外: 罫線で区別する
          : "border border-input focus-visible:border-ring disabled:bg-input/50 aria-invalid:border-destructive dark:bg-input/30",
        // 🚨 **変えられない値は、入力欄に見せない**（堀池・2026-08-15 原文）:
        // > 「変更できない ID などはそもそも背景を Input タグと同じにしない。（背景なし）
        // >   …ID は必ず必要で変更できないのに、背景が .bg-muted/60 なので、**編集できると思ってしまう**。
        // >   **これは UIUX で絶対にやってはいけないこと。なんのために Variant があるのか理解して。**」
        //
        // `readOnly` が付いた時点で「これは値の表示であって欄ではない」ことが確定するので、
        // **prop を増やさず `read-only:` 修飾子で見た目を切り替える**（付け忘れが起きない）。
        // 🚨 `disabled` とは別物。disabled は「いまは使えない」、readOnly は「そもそも変えられない」。
        //    disabled の色分けはそのまま残す。
        // 罫線・背景・左右の余白をすべて外し、**ラベルの下に置かれた文字**として見せる。
        // 🚨 `<input>` のままにするのは、**ID をなぞって選択・コピーできる必要がある**ため
        //    （`<p>` にすると値だけを選びにくくなる）。
        "read-only:border-transparent read-only:bg-transparent read-only:px-0 read-only:cursor-default read-only:focus-visible:ring-0",
        className
      )}
      {...props}
    />
  )
}

export { Input }
