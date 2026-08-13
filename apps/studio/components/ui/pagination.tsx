"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

/**
 * ページ送り。`@shadcn/pagination`（registry: base-nova）を元にしている。
 *
 * 🚨 **自作したものではない。** 憲章 §2「自作する前に、必ず既製があるかを確認する」に従って
 * `npx shadcn@latest view @shadcn/pagination` の実装を写した。registryDependencies は `button` だけで、
 * npm パッケージは1つも増えていない。
 *
 * 素の registry から変えたのは次の3点だけ:
 *
 *  1. 🚨 **文言を辞書へ逃がした**。registry は `text = "Previous"` / `"Next"` / `"More pages"` /
 *     `aria-label="Go to previous page"` を**英語リテラルで直書き**している。
 *     AGENTS.md §3.8 は**英語のリテラルも禁止**（日本語だけ消して `Save` が残る事故を防ぐため）なので、
 *     `useT("common")` を通す。12箇所の呼び出し側に同じ文言を書かせないためでもある（DRY）。
 *  2. `IconPlaceholder`（registry 内部の部品で、このリポジトリには無い）を lucide-react に置き換えた。
 *  3. 寸法を `--control-h-*` から取るようにした（app/globals.css が唯一の定義場所）。
 *
 * 面は作らない（§1）。ページ送りは Divider の下に置くだけで、箱で囲まない。
 */
function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  const t = useT("common")
  return (
    <nav
      role="navigation"
      aria-label={t("pagination_label")}
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-0.5", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

// 🚨 交差型をここで組み立てないこと。i18n のハードコード検出器は
//    「ジェネリクスの閉じ括弧 `>` の直後に来る `&`」を JSX テキストと誤読して落ちる
//    （`components/ui/input-group.tsx:46` に同じ記録がある。実測でここでも1回踏んだ）。
//    先に別名を付けて、`>` の直後に演算子が来ないようにしている。
type PaginationLinkSize = Pick<React.ComponentProps<typeof Button>, "size">
type PaginationLinkAnchor = React.ComponentProps<"a">
type PaginationLinkProps = { isActive?: boolean } & PaginationLinkSize &
  PaginationLinkAnchor

/**
 * ページ番号のリンク。**`<a>` で描く**ので、リロードでも共有でも同じページに戻る
 * （憲章 §4「既定の件数を決め、URL に載せる」）。
 */
function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <Button
      variant={isActive ? "outline" : "ghost"}
      size={size}
      className={cn(className)}
      nativeButton={false}
      render={
        <a
          aria-current={isActive ? "page" : undefined}
          data-slot="pagination-link"
          data-active={isActive}
          {...props}
        />
      }
    />
  )
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  const t = useT("common")
  return (
    <PaginationLink
      aria-label={t("pagination_previous")}
      size="default"
      className={cn("pl-1.5!", className)}
      {...props}
    >
      <ChevronLeftIcon data-icon="inline-start" />
      {/* SP では矢印だけにする。文字まで出すと 44px のボタンが横に並ばない */}
      <span className="hidden sm:block">{t("pagination_previous")}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  const t = useT("common")
  return (
    <PaginationLink
      aria-label={t("pagination_next")}
      size="default"
      className={cn("pr-1.5!", className)}
      {...props}
    >
      <span className="hidden sm:block">{t("pagination_next")}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const t = useT("common")
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-(--control-h) items-center justify-center md:size-(--control-h-pc) [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">{t("pagination_more")}</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
