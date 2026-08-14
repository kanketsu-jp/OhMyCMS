"use client"

import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { CheckIcon, InfoIcon, TriangleAlertIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

/** 🚨 3秒。堀池（idea.md「トーストはプログレスバーで３秒で消えるようにする」）。
 *  ここを変えるときは globals.css の `ohmycms-toast-progress` の秒数も必ず一緒に変える。
 *  **片方だけ変えるとバーが端に着く前／着いた後に消える**（見た目で嘘をつく）。 */
const TOAST_TIMEOUT_MS = 3000

/** 画面に同時に出す上限。溢れたぶんは古いものから畳まれる。 */
const TOAST_LIMIT = 3

export type ToastType = "success" | "error" | "info"

export type ToastOptions = {
  /** 本文（任意）。タイトルだけで足りるなら省く。 */
  description?: string
  /** 既定 3000ms。0 を渡すと自動で消えない。 */
  timeout?: number
}

/** 🚨 モジュール直下に作る。
 *  こうすると `toast.success(...)` が **hook でなく素の関数**になり、イベントハンドラ・
 *  `.then()`・`catch` など React の外からでも呼べる。他ペインへ配った契約もこの形。 */
const manager = ToastPrimitive.createToastManager()

function add(type: ToastType, message: string, options?: ToastOptions) {
  return manager.add({
    title: message,
    description: options?.description,
    type,
    timeout: options?.timeout ?? TOAST_TIMEOUT_MS,
    // 読み上げ順。失敗だけは割り込ませる。
    priority: type === "error" ? "high" : "low",
  })
}

/**
 * 画面右下（SP は上部）に出る通知。
 *
 * 🚨 `message` は **翻訳済みの文字列**を渡すこと。キーでもリテラルでもない。
 *    呼び出し側で `useT` から訳した値を渡す。
 *    ここで辞書を引かないのは、名前空間が呼び出し側ごとに違うから。
 *
 *    （ここに呼び出し例をコードの形で書かないこと。scripts/check-i18n-usage.mjs は
 *      コメントと実コードを区別しないので、例の中の辞書キーを「呼んでいるのに辞書に
 *      無いキー」として拾って落ちる。実測済み。）
 */
export const toast = {
  success: (message: string, options?: ToastOptions) =>
    add("success", message, options),
  error: (message: string, options?: ToastOptions) =>
    add("error", message, options),
  info: (message: string, options?: ToastOptions) =>
    add("info", message, options),
  /** id を省くとすべて閉じる。 */
  dismiss: (id?: string) => manager.close(id),
}

const TYPE_ICON = {
  success: CheckIcon,
  error: TriangleAlertIcon,
  info: InfoIcon,
} as const

function ToastList() {
  const t = useT("common")
  const { toasts } = ToastPrimitive.useToastManager()

  return toasts.map((item) => {
    const type = (item.type ?? "info") as ToastType
    const Icon = TYPE_ICON[type] ?? InfoIcon

    return (
      <ToastPrimitive.Root
        key={item.id}
        toast={item}
        data-slot="toast"
        // 🚨 SP は上から、PC は下から入る。**出てくる向きは置き場所と揃える**
        //    （下に置いたものが上から降ってくると、どこから来たか分からない）。
        className={cn(
          "group/toast relative isolate w-full overflow-hidden rounded-lg bg-clip-padding text-sm ring-1 shadow-lg transition-all duration-200",
          "data-starting-style:opacity-0 data-ending-style:opacity-0",
          "data-starting-style:-translate-y-2 data-ending-style:-translate-y-2",
          "md:data-starting-style:translate-y-2 md:data-ending-style:translate-y-2",
          // 🚨 色は堀池の指定そのまま（success = emerald-50 → emerald-100）。
          //    error / info は指定が無いので同じ作りで揃えた（design のトークン確定後に差し替える）。
          "data-[type=success]:bg-emerald-50 data-[type=success]:text-emerald-950 data-[type=success]:ring-emerald-600/20",
          "dark:data-[type=success]:bg-emerald-950 dark:data-[type=success]:text-emerald-50 dark:data-[type=success]:ring-emerald-400/20",
          "data-[type=error]:bg-red-50 data-[type=error]:text-red-950 data-[type=error]:ring-red-600/20",
          "dark:data-[type=error]:bg-red-950 dark:data-[type=error]:text-red-50 dark:data-[type=error]:ring-red-400/20",
          "data-[type=info]:bg-popover data-[type=info]:text-popover-foreground data-[type=info]:ring-foreground/10"
        )}
      >
        {/* プログレスバー＝**背景色**（堀池「プログレスバーは背景色で表現する」）。
            左から3秒かけて濃い側へ塗り替わる。バーではなく面が動くので、
            要素をひとつも増やさずに「あと何秒か」が伝わる。
            🚨 `motion-safe:` を付けてあるので、動きを減らす設定の人には塗りが動かない。
               それでも 3 秒で消えること自体は変わらない（消える仕組みは JS 側）。 */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 origin-left scale-x-0",
            "motion-safe:animate-[ohmycms-toast-progress_3s_linear_forwards]",
            // 触っているあいだは base-ui が自動で消すのを止める。塗りも一緒に止めないとズレる。
            "group-data-[expanded]/toast:[animation-play-state:paused]",
            "group-data-[type=success]/toast:bg-emerald-100 dark:group-data-[type=success]/toast:bg-emerald-900",
            "group-data-[type=error]/toast:bg-red-100 dark:group-data-[type=error]/toast:bg-red-900",
            "group-data-[type=info]/toast:bg-muted"
          )}
        />

        <ToastPrimitive.Content className="flex items-start gap-2.5 p-3 pr-2">
          <Icon className="mt-px size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <ToastPrimitive.Title
              data-slot="toast-title"
              className="font-medium break-words"
            />
            {item.description ? (
              <ToastPrimitive.Description
                data-slot="toast-description"
                className="break-words opacity-80"
              />
            ) : null}
          </div>
          <ToastPrimitive.Close
            data-slot="toast-close"
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mt-0.5 shrink-0 hover:bg-black/5 dark:hover:bg-white/10"
              />
            }
          >
            <XIcon />
            <span className="sr-only">{t("close")}</span>
          </ToastPrimitive.Close>
        </ToastPrimitive.Content>
      </ToastPrimitive.Root>
    )
  })
}

/**
 * トーストの置き場所。ルートレイアウトに1つだけ置く。
 *
 * 🚨 **SP は画面上部・PC は画面右下**（堀池 idea.md）。
 *    理由は原文どおり「SP では親指が届く下部の操作の優先度が高く、そこにトーストが
 *    重なると操作できなくなる」ため。下部固定のモバイルナビ（z-40）とも衝突しない。
 * 🚨 **z-[100]**。components/ui のオーバーレイ（dialog の backdrop / popup、sheet）は
 *    すべて z-50 なので、モーダルが開いていてもトーストが前に出る。
 *    **他のオーバーレイ側の z-50 を上げないこと**（上げるならここも一緒に上げる）。
 */
export function Toaster() {
  return (
    <ToastPrimitive.Provider
      toastManager={manager}
      timeout={TOAST_TIMEOUT_MS}
      limit={TOAST_LIMIT}
    >
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          className={cn(
            "fixed z-[100] flex w-full flex-col gap-2 outline-none",
            // SP: 画面上部。ノッチ／ステータスバーぶんを避ける。
            "top-0 right-0 left-0 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]",
            // PC: 画面右下。幅は読み切れる範囲で止める。
            "md:top-auto md:right-4 md:bottom-4 md:left-auto md:max-w-sm md:px-0 md:pt-0"
          )}
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}
