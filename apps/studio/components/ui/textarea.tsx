"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useInsideSurface } from "@/components/ui/surface"

/**
 * 複数行の入力。
 *
 * 🚨 **面の中では罫線を外し、背景で区別する**（docs/design/surface-rules.md §2-2）。
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
        "w-full min-w-0 rounded-lg bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none field-sizing-content placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        insideSurface
          // 面の中: 罫線を持たず背景で区別する
          ? "bg-muted/60 disabled:bg-muted/40"
          // 面の外: 罫線で区別する
          : "border border-input focus-visible:border-ring disabled:bg-input/50 aria-invalid:border-destructive dark:bg-input/30",
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
        "h-(--control-h) w-full min-w-0 rounded-lg bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:h-(--control-h-pc) md:text-sm",
        insideSurface
          ? "bg-muted/60 disabled:bg-muted/40"
          : "border border-input focus-visible:border-ring disabled:bg-input/50 dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea, NativeSelect }
