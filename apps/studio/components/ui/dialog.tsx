"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { SurfaceDepthContext } from "@/components/ui/surface"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { useT } from "@/i18n/client"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const t = useT("common")
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // 🚨 **SP は画面いっぱい。PC は中央の箱のまま。**（堀池・2026-08-15 判断）
          // > 「Shadcn は海外なので日本語で欲しい高さがボタンではなく、ボタンが窮屈に見えるなど
          // >   カスタムがひつようです。その中でも必須なのはモーダル。**モーダルは画面いっぱい**」
          // 🚨 **PC まで全画面にしない。** ファイル選択・コマンドパレット・確認ダイアログまで
          //    画面を覆ってしまう（8ペインが使う部品なので、影響範囲で決めた）。
          //
          // SP: 上下左右いっぱい・角丸なし・拡大の動きなし（全画面に拡大縮小は合わない）
          // PC: 従来どおり中央・最大 sm・角丸・拡大の動きあり
          "fixed z-50 grid gap-4 bg-popover text-sm text-popover-foreground duration-100 outline-none",
          "inset-0 h-dvh w-screen overflow-y-auto p-4",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-visible sm:rounded-xl sm:ring-1 sm:ring-foreground/10",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          "sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {/* 🚨 **ダイアログはそれ自体が面**（bg-popover を持つ）。深さ1を配ることで、
            中の Input が「面の中」と判断して罫線を落とし、塗りだけになる。
            配らないと、面の中に罫線つきの入力が入って**面が2段**になる（実測で確認）。 */}
        <SurfaceDepthContext value={1}>
        {children}
        </SurfaceDepthContext>
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
            <XIcon
            />
            <span className="sr-only">{t("close")}</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const t = useT("common")
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // 🚨 **塗りを持たない。** ダイアログ自体が面なので、footer を塗ると面が2段になる（実測で深さ2）。
        // 区切りは `border-t` の1本で足りる——堀池「2つ要素が並ぶ場合は、その間に Divider を用意する」。
        // 塗りは「別の領域」の主張だが、footer は同じダイアログの一部で別領域ではない。
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{t("close")}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
