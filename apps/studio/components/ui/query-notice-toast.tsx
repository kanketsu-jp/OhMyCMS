"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { noticeKeyFromQuery } from "@/i18n/notice"
import { useT } from "@/i18n/client"
import { toast } from "@/components/ui/toast"

/**
 * `?notice=item_saved` を **1回だけ**トーストにして、URL から消す。
 *
 * なぜ client 側なのか:
 *   これまでは Server Component が `<div className="text-sm text-muted-foreground">` として
 *   描いていた。トーストは client の状態なので、サーバ側からは出せない。
 *
 * 🚨 **出したら URL から消すところまでが1組**。消さないとリロード・戻る操作のたびに
 *    「保存しました」が出続ける（保存していないのに）。
 *
 * 🚨 **許可リスト（i18n/notice.ts）は捨てない。** URL は利用者が自由に書けるので、
 *    `?notice=<でたらめ>` が素通りすると未定義キーがそのまま画面に出る。
 *    出す場所がページからトーストへ変わっても、この検査の意味は変わらない。
 *
 * 🚨 **`?error=` はここで扱わない。ページの `ErrorBanner` に残す。**
 *    司令塔の決定（2026-08-15）:「出来事はトースト、状態はページに残す。
 *    ユーザーが対処を要するものはタイマーに載せない」。
 *    実際に `?error=` が運ぶのは `error_invalid_input` / `error_field_required` /
 *    `error_related_collection_required` / `error_delete_target_required` /
 *    `error_invalid_kind`（403 を含む）——**全部が入力のやり直しを要する「状態」**で、
 *    3秒で消えると直す手掛かりが無くなる。
 *    🚨 ここには `apiMessage()`（API の生文言）も挙げていたが、**その関数は 2026-08-15 に
 *    削除した**（生文言を `?error=` に載せると、細工したリンクで任意の文章を
 *    公式のエラー枠に出せるため）。いま `?error=` が運ぶのは**許可リストの code だけ**。
 *    一度トーストへ移して戻した経緯なので、**同じ書き換えを繰り返さないこと。**
 *    決定: knowledge/decisions/toast-for-events-page-for-what-needs-fixing.md
 */
export function QueryNoticeToast() {
  const t = useT("notifications")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // 🚨 同じクエリで二度出さないための印。
  //    開発時の Strict Mode は effect を2回走らせるので、これが無いと必ず二重に出る。
  const firedRef = useRef<string | null>(null)

  useEffect(() => {
    const notice = searchParams.get("notice")

    if (notice === null) {
      // クエリが無い状態まで戻ったら印を捨てる。捨てないと、同じ画面で
      // もう一度保存したときに「さっきと同じクエリ」と見なして出なくなる。
      firedRef.current = null
      return
    }

    const signature = `${pathname} ${notice}`
    if (firedRef.current === signature) return
    firedRef.current = signature

    const noticeKey = noticeKeyFromQuery(notice)
    if (noticeKey) toast.success(t(noticeKey))

    // 🚨 `notice` だけを消す。`error` は消さない（ページ側がまだ描いている）。
    const next = new URLSearchParams(searchParams)
    next.delete("notice")
    const rest = next.toString()

    // 🚨 replace（push ではない）。push にすると「戻る」で通知付き URL に戻ってしまう。
    //    scroll: false は、消すだけの遷移で画面が先頭へ飛ばないようにするため。
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false })
  }, [searchParams, pathname, router, t])

  return null
}
