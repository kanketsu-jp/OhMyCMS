"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

/**
 * 入力欄とアイコン・補助ボタンを一つの欄として束ねる部品群。
 *
 * 🚨 触るときの注意:
 * - 高さは `--control-h-*` に任せる。SPの44pxを `h-8` 等で上書きしない。
 * - 面の中では背景だけで区別し、入力・アドオンに個別の罫線や面を重ねない。
 *
 * 参考: DESIGN.md §1-2 ／ knowledge/decisions/no-nested-surfaces.md
 */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group relative flex h-(--control-h) w-full min-w-0 items-center rounded-lg border border-input md:h-(--control-h-pc-field) transition-colors outline-none in-data-[slot=combobox-content]:focus-within:border-inherit in-data-[slot=combobox-content]:focus-within:ring-0 has-disabled:bg-input/50 has-disabled:text-muted-foreground has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-3 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto dark:bg-input/30 dark:has-disabled:bg-input/80 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40 has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        className
      )}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:text-muted-foreground [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start":
          "order-first pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]",
        "inline-end":
          "order-last pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]",
        "block-start":
          "order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
        "block-end":
          "order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
)

// 🚨 `&` を使った交差型にしないこと。ジェネリクスの閉じ括弧の直後に `&` が来ると、
//    i18n のハードコード検出器が JSX テキストと誤読する（実測で受入 #7 が落ちた）。
//    interface + extends なら `&` が要らない。
// 🚨 交差型の書き方に注意。i18n のハードコード検出器は
//    「ジェネリクスの閉じ括弧 `>` の直後に来る `,` や `&`」を JSX テキストと誤読する。
//    先に別名を付けて、`>` の直後に演算子が来ないようにしている（実測で回避を確認）。
type InputGroupAddonVariants = VariantProps<typeof inputGroupAddonVariants>
type InputGroupAddonProps = InputGroupAddonVariants & React.ComponentProps<"div">

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: InputGroupAddonProps) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva(
  "flex items-center gap-2 text-sm shadow-none",
  {
    variants: {
      size: {
        // 入力の**内側**に載る操作。器（入力）より大きくなれない。
        // 🚨 `md:` まで書くのは、Button 側の default が `md:h-(--control-h-pc)` を持っており、
        //    twMerge は変異体ごとに別クラスとして扱うため、書かないと md で 32px に戻ってしまうから。
        //
        // 🚨 **2026-08-14 反転**: ここは元々「器より大きくなれないので、**SP でも上げない**」として
        // 24px で据え置いていた。だが実測すると、**器（入力）自体が SP で 44px ある**ので、
        // 44px まで上げても**はみ出さない**（同じ高さになるだけ）。
        // 「大きくなれない」は正しいが、「だから上げられない」は誤りだった。
        // → **見た目は 24px のまま、押せる範囲だけ器いっぱいに広げる**。
        //    アイコンは `size-3.5` のままなので、見え方は変わらない。
        xs: "min-h-(--control-h) h-(--control-h-xs) gap-1 rounded-[calc(var(--radius)-3px)] px-1.5 md:min-h-(--control-h-pc) md:h-(--control-h-xs) [&>svg:not([class*='size-'])]:size-3.5",
        sm: "",
        "icon-xs":
          "size-(--control-h-xs) rounded-[calc(var(--radius)-3px)] p-0 has-[>svg]:p-0 md:size-(--control-h-xs)",
        "icon-sm": "size-(--control-h-pc) p-0 has-[>svg]:p-0 md:size-(--control-h-pc)",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
)

type InputGroupButtonVariants = VariantProps<typeof inputGroupButtonVariants>
type InputGroupButtonBase = Omit<React.ComponentProps<typeof Button>, "size" | "type">
type InputGroupButtonProps = InputGroupButtonVariants &
  InputGroupButtonBase & { type?: "button" | "submit" | "reset" }

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: InputGroupButtonProps) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        "flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
