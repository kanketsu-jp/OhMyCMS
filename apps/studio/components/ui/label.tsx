"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * 入力欄に対応するラベル。
 *
 * 🚨 触るときの注意:
 * - ラベル文言は呼び出し側でリテラルを書かず、辞書キーから渡す（AGENTS.md §3.8）。
 * - disabled 状態の色と操作抑止は、入力側の状態と対になるこの既定値を保つ。
 *
 * 参考: DESIGN.md §1-8 ／ AGENTS.md §3.8
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Label }
