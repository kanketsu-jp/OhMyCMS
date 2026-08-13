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
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const insideSurface = useInsideSurface()

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-inside-surface={insideSurface ? "true" : undefined}
      className={cn(
        // 高さは --control-h-*（app/globals.css）だけが決める。SP は指のために 44px。
        "h-(--control-h) w-full min-w-0 rounded-lg bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-(--control-h-xs) file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-muted-foreground aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:h-(--control-h-pc-field) md:text-sm",
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

export { Input }
