"use client"

import * as React from "react"
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

type ToastItem = {
  id: string
  title: string
  description?: string
  type: ToastType
  timeout: number
}

/** 🚨 モジュール直下に作る。
 *  こうすると `toast.success(...)` が **hook でなく素の関数**になり、イベントハンドラ・
 *  `.then()`・`catch` など React の外からでも呼べる。他ペインへ配った契約もこの形。 */
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let currentToasts: ToastItem[] = []
let toastSeq = 0

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return currentToasts
}

function close(id?: string) {
  if (!id) {
    for (const timer of timers.values()) {
      clearTimeout(timer)
    }
    timers.clear()
    currentToasts = []
    emit()
    return
  }

  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  currentToasts = currentToasts.filter((item) => item.id !== id)
  emit()
}

function add(type: ToastType, message: string, options?: ToastOptions) {
  const id = `toast-${Date.now()}-${toastSeq}`
  toastSeq += 1
  const item: ToastItem = {
    id,
    title: message,
    description: options?.description,
    type,
    timeout: options?.timeout ?? TOAST_TIMEOUT_MS,
  }

  currentToasts = [...currentToasts, item].slice(-TOAST_LIMIT)
  emit()

  if (item.timeout > 0) {
    timers.set(
      id,
      setTimeout(() => close(id), item.timeout)
    )
  }

  return id
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
  dismiss: (id?: string) => close(id),
}

const TYPE_ICON = {
  success: CheckIcon,
  error: TriangleAlertIcon,
  info: InfoIcon,
} as const

function ToastList() {
  const t = useT("common")
  const toasts = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return toasts.map((item) => {
    const Icon = TYPE_ICON[item.type] ?? InfoIcon

    return (
      <div
        key={item.id}
        data-slot="toast"
        data-type={item.type}
        role={item.type === "error" ? "alert" : "status"}
        // 🚨 SP は上から、PC は下から入る。**出てくる向きは置き場所と揃える**
        //    （下に置いたものが上から降ってくると、どこから来たか分からない）。
        className={cn(
          // Radix DismissableLayer がモーダル中に body へ pointer-events:none を付けても、
          // toast 本体の auto で継承を断ち切り、閉じるボタンを押せるようにする。
          "group/toast pointer-events-auto relative isolate w-full overflow-hidden rounded-lg bg-clip-padding text-sm ring-1 shadow-lg transition-all duration-200",
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
            "group-data-[type=success]/toast:bg-emerald-100 dark:group-data-[type=success]/toast:bg-emerald-900",
            "group-data-[type=error]/toast:bg-red-100 dark:group-data-[type=error]/toast:bg-red-900",
            "group-data-[type=info]/toast:bg-muted"
          )}
        />

        <div className="flex items-start gap-2.5 p-3 pr-2">
          <Icon className="mt-px size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div
              data-slot="toast-title"
              className="font-medium break-words"
            >
              {item.title}
            </div>
            {item.description ? (
              <div
                data-slot="toast-description"
                className="break-words opacity-80"
              >
                {item.description}
              </div>
            ) : null}
          </div>
          {/* 44px の当たり判定は縮めず、負の縦マージンで行の高さへの寄与だけを本文1行ぶんに抑える。 */}
          {/* 堀池さん指示: hover: には必ず active: も付ける。 */}
          {/* タッチ端末には hover が無く、押した手応えが出ないため。 */}
          {/* 濃さは hover と同じ。押し込みは Button base の 1px 沈みが担当する。 */}
          {/* dark: 側も対にする（design 指摘・2026-08-15）。 */}
          <Button
            type="button"
            data-slot="toast-close"
            variant="ghost"
            size="icon-sm"
            className="-my-3 shrink-0 hover:bg-black/5 active:bg-black/5 dark:hover:bg-white/10 dark:active:bg-white/10"
            onClick={() => close(item.id)}
          >
            <XIcon />
            <span className="sr-only">{t("close")}</span>
          </Button>
        </div>
      </div>
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
    <div
      data-slot="toast-viewport"
      /*
       * Radix Dialog の hideOthers() は `querySelectorAll('[aria-live], script')` に
       * 一致するノードを aria-hidden 化しない。主目的はトースト viewport に
       * aria-hidden を付けさせないことで、role="status"/"alert" だけでは
       * literal な `[aria-live]` 属性セレクタに一致しない。
       */
      aria-live="polite"
      className={cn(
        // viewport は常時 mounted なので空でも SP 上端のタップを奪う。祖先が pointer-events:none でも
        // 子の auto は hit-test 可能なため、個別 toast だけクリック可能にする。
        "fixed z-[100] pointer-events-none flex w-full flex-col gap-2 outline-none",
        // SP: 画面上部。ノッチ／ステータスバーぶんを避ける。
        "top-0 right-0 left-0 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]",
        // PC: 画面右下。幅は読み切れる範囲で止める。
        "md:top-auto md:right-4 md:bottom-4 md:left-auto md:max-w-sm md:px-0 md:pt-0"
      )}
    >
      <ToastList />
    </div>
  )
}
