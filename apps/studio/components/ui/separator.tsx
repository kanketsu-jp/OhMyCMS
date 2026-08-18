"use client"

import * as React from "react"
import { Separator as SeparatorPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * 節の見出しと中身など、意味のある領域を分ける線。
 *
 * 🚨 触るときの注意:
 * - 項目間の空白の代わりに使わない。線の前後の余白は呼び出し側で確保する。
 * - 色は `border` トークンを使い、生の色や不要な `dark:` を追加しない。
 *
 * 参考: DESIGN.md §1-3・§1-9 ／ `components/ui/surface.tsx`
 */
function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
