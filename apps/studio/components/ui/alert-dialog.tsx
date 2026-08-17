"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { SurfaceDepthContext } from "@/components/ui/surface"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

/**
 * **戻せない操作の確認**。
 *
 * 🚨 **なぜ作ったか（2026-08-17）。** ここまで確認は `window.confirm` で出していた（**3 箇所**）。
 *   本文は辞書を通っていたが、🚨 **「OK / キャンセル」のボタンは OS の言語**で出る。
 *   ＝ **私たちの辞書の外に、変えられない UI 文言が 2 つ出ていた**——
 *   **AGENTS.md §3.8「全文言が自前の辞書にある」への、そのままの違反**。
 *   （既存 CMS 4 本のうち Keystone が `Create` / `Save` / `Delete` を日本語にできず脱落した。
 *     **その理由で自作したのに、同じものを出していた**。）
 *
 * 🚨 **`Dialog` と分ける理由**（見た目はほぼ同じでも、性質が違う）:
 *   `Dialog` …… 何かを**する**ための面。外を押せば閉じてよい。閉じるだけの ✕ が在る
 *   `AlertDialog` … **選ばないと進めない**。**外を押しても閉じない**（Radix の既定）／
 *     🚨 **✕ を置かない**（「閉じる」と「やめる」が別に見えると、どちらが取り消しか分からない）／
 *     🚨 **焦点は「やめる」に当たる**（Radix の既定。**危険なほうを既定にしない**）
 *
 * 🚨 **色は 2 段しか持たない**（`tone`）。base2 が Directus で見た
 *   「削除＝危険 / アーカイブ＝警告」の **警告は作っていない**。理由:
 *     ・置き換えた 3 箇所のうち、**危険は 1 つだけ**（完全削除）
 *     ・**`warning` のトークンも variant も、この PJ に無い**（＝ パレットに手を入れる別の判断）
 *     ・🚨 残る 2 つは**意味が違う**（ラベル削除＝戻せる／離脱＝保存していない入力）。
 *       **同じ「警告色」で括ると、また「同じ顔で違う意味」になる**
 *   ＝ **要ると分かってから足す。** 足すときは**何と何を分けるのか**を先に決めること。
 */
function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          // 🚨 `dialog.tsx` と同じ寸法にする（SP は画面いっぱい／PC は中央の箱）。
          //    堀池・2026-08-15「モーダルは画面いっぱい」。**確認だけ別の形にしない。**
          "fixed z-50 grid gap-4 bg-popover text-sm text-popover-foreground duration-100 outline-none",
          "inset-0 h-dvh w-screen overflow-y-auto p-4",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-visible sm:rounded-xl sm:ring-1 sm:ring-foreground/10",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          "sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {/* 🚨 面は 1 段まで（`no-nested-surfaces`）。中身は 1 段目として扱う。 */}
        <SurfaceDepthContext value={1}>{children}</SurfaceDepthContext>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("font-heading text-base font-semibold", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * 進めるボタン。
 * 🚨 `tone="danger"` で `destructive` の見た目にする（**既定は普通**）。
 */
function AlertDialogAction({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  tone?: "default" | "danger"
}) {
  return (
    <AlertDialogPrimitive.Action asChild>
      <Button
        data-slot="alert-dialog-action"
        variant={tone === "danger" ? "destructive" : "default"}
        className={className}
        {...props}
      />
    </AlertDialogPrimitive.Action>
  )
}

/**
 * やめるボタン。
 * 🚨 **文言は既定で辞書から**（`common.action_cancel` =「やめる」）。
 *   ＝ **呼ぶ側が毎回書かなくても、OS の言語にはならない**。
 */
function AlertDialogCancel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  const t = useT("common")
  return (
    <AlertDialogPrimitive.Cancel asChild>
      <Button data-slot="alert-dialog-cancel" variant="secondary" className={className} {...props}>
        {children ?? t("action_cancel")}
      </Button>
    </AlertDialogPrimitive.Cancel>
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
