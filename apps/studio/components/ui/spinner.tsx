import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * 処理中を示す輪。
 *
 * 🚨 **これ自体は名前を持たない**（`aria-hidden`）。
 *    スピナーが読み上げ名になると、ボタンの「保存」という名前が消える。
 *    名前は必ず親（ボタンの文字・`aria-label`）が持つ。
 *
 * 🚨 **動きを減らす設定の人には回さない**（`motion-safe:`）。
 *    回らなくても輪は出ているので「処理中」は伝わる。無限に回るものは
 *    その設定をしている人にとって実害がある。
 *
 * 🚨 `data-slot="spinner"` は既存の約束。`components/ui/attachment.tsx:71` が
 *    このスロットを前提に大きさを指定しているので、名前を変えないこと。
 */
export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof Loader2Icon>) {
  return (
    <Loader2Icon
      data-slot="spinner"
      aria-hidden="true"
      className={cn("size-4 shrink-0 motion-safe:animate-spin", className)}
      {...props}
    />
  )
}
