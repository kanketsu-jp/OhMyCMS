"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { ScrollFade } from "@/components/ui/scroll-fade"

/**
 * 横幅が収まらない表を、スクロール可能な器とともに表示する部品群。
 *
 * 🚨 触るときの注意:
 * - スクロールするのは `ScrollFade` の器。表を別の外側で包んで fade を二重にしない。
 * - 0件のときに列見出しだけの表を出さず、画面側で空状態へ出し分ける。
 *
 * 参考: DESIGN.md §1-4・§1-5 ／ `components/ui/scroll-fade.tsx`
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    // 🚨 スクロールするのはこの器なので、fade も**この器そのもの**に当たる（外側に巻かない）。
    <ScrollFade direction="horizontal" data-slot="table-container" className="relative w-full">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </ScrollFade>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 active:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // 🚨 素の `h-10` を書かない。高さは app/globals.css の --control-h-* だけが決める
        //    （2026-08-15。トークンを動かしても素の数字は追随せず、置き去りが静かに増える。
        //     実際 --control-h-pc を 32→36px にしたとき、素の値のファイルだけ取り残された）。
        //    40px は --control-h-pc-lg と同値なので、**見た目は変わらない**。
        "h-(--control-h-pc-lg) px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
