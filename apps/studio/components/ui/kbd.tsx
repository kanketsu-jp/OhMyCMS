import { cn } from "@/lib/utils"

/**
 * キーボードショートカットを示す表示部品。
 *
 * 🚨 触るときの注意:
 * - 操作を詰まらせるバッジとして使わず、ショートカットの補助表示に限定する（DESIGN.md §2-4）。
 * - ツールチップ内では背景と文字のトークンを反転させる指定を保ち、ダークでも読めるようにする。
 *
 * 参考: DESIGN.md §2-4 ／ components/ui/tooltip.tsx
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
