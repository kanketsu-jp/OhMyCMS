"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useInsideSurface } from "@/components/ui/surface"

/**
 * 複数行の入力。
 *
 * 🚨 **面の中では罫線を外し、背景で区別する**（knowledge/decisions/no-nested-surfaces.md §2-2）。
 * input.tsx とまったく同じ考え方で、実装も揃えてある。片方だけ直すとズレるので、
 * どちらかを変えるときは両方見ること。
 *
 * 堀池さん（原文）:「もし、ボーダーのなかにボーダーの Input タグを入れたくなったら、
 * Input タグのボーダーを消して、背景色を bg-zinc-100 などにするか、
 * Input タグの親要素の背景を変えるなどして。」
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const insideSurface = useInsideSurface()

  return (
    <textarea
      data-slot="textarea"
      data-inside-surface={insideSurface ? "true" : undefined}
      className={cn(
        // 🚨 `field-sizing-content` は中身の行数に合わせて縮むので、rows を指定していても
        // **1行ぶん（実測 38px）**まで小さくなる。SP の指の当たり判定を割るので下限を置く。
        "min-h-(--control-h) w-full min-w-0 rounded-lg bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none field-sizing-content md:min-h-(--control-h-pc) placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-muted-foreground aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        insideSurface
          // 面の中: 罫線を持たず背景で区別する
          ? "bg-input disabled:bg-muted/40"
          // 面の外: 罫線で区別する
          : "border border-input focus-visible:border-ring disabled:bg-input/50 aria-invalid:border-destructive dark:bg-input/30",
        // 🚨 **`input.tsx` と同じ扱いにする**（2026-08-16 に**欠けているのを実測で見つけた**）。
        //    表示モードの目標は「**値が文字として見える**」（罫線なし・背景なし・左余白なし。
        //    `knowledge/decisions/action-button-and-edit-mode.md` §2-1・design 案 2）。
        //    実測: `/admin/settings/sso` の属性欄が、**表示モードと編集モードで見た目が同一**だった
        //    （罫線 1px・左余白 10px がどちらも同じ）＝ **欄のままに見えていた**。
        //    `<Input>` には既に在ったので、**同じ画面の中で作法が割れていた**。
        // 🚨 `<textarea>` のままにするのは、**なぞって選択・コピーできる必要がある**ため（input と同じ理由）。
        // 🚨 `disabled` とは別物。disabled は「いまは使えない」、readOnly は「そもそも変えられない」。
        // 🚨 2026-08-17 に堀池さんの指摘で反転（`input.tsx` と同じ）:
        // > 「フィールドの枠がないので、わからない。」
        //    枠は出さず、薄い地の色と通常入力と同じ左右余白で、欄が在ることを示す。
        // 🚨 **`input.tsx` だけ直しても半分しか直らない**。実測（2026-08-17）:
        //    `/admin/settings/sso` の読み取り専用 9 欄のうち **5 欄が textarea** で、
        //    input だけ直した時点では **その 5 欄が透明のまま**だった。
        "read-only:border-transparent read-only:bg-muted read-only:px-3 read-only:cursor-default read-only:focus-visible:ring-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * ネイティブの `<select>`。Base UI の Select（components/ui/select.tsx）は
 * ポップアップを伴う重い部品なので、値が2〜3個の設定用にはこちらを使う。
 * 面の中での見せ方は Input / Textarea と揃えてある。
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  const insideSurface = useInsideSurface()

  return (
    <select
      data-slot="native-select"
      data-inside-surface={insideSurface ? "true" : undefined}
      className={cn(
        // 高さは --control-h-*（app/globals.css）だけが決める。SP は指のために 44px。
        // 🚨 文字は text-base（16px）から。SP で 16px を割ると iOS が focus 時に画面を拡大する（憲章 §7 R5）。
        "min-h-(--control-h) w-full min-w-0 rounded-lg bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-muted-foreground md:min-h-(--control-h-pc-field) md:text-sm",
        insideSurface
          ? "bg-input disabled:bg-muted/40"
          : "border border-input focus-visible:border-ring disabled:bg-input/50 dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea, NativeSelect }
