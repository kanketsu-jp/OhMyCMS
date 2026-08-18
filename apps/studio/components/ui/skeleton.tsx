import { cn } from "@/lib/utils"

/**
 * 読み込み中の領域を示すプレースホルダー。
 *
 * 🚨 触るときの注意:
 * - `bg-muted` はテーマトークンなので、生の色や個別の `dark:` を足さない。
 * - 中身が無い状態の器を恒久表示しない。読み込み状態の間だけ画面側で出し分ける。
 *
 * 参考: DESIGN.md §1-4 ／ `components/admin/page-skeleton.tsx`
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
