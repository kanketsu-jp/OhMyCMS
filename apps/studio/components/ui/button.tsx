import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // 🚨 無効状態を base に置かない。variant ごとに**色そのものを変える**（憲章 §3）。
  // `opacity` で薄くすると要素全体が均等に薄くなるだけで、文字と背景の関係は変わらない
  // ＝「押せない」ことが色として伝わらない。手本（X / WorkOS）はどちらもグレーへ**色を変える**。
  // base に置いてよいのは、色を持たない `pointer-events-none` だけ。
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      // 🚨 色トークンは design が未確定。いまは既存の muted 系で組んである。
      // 確定したら **この variant 表の中だけ**を差し替えれば済む（呼び出し側には色を書かない）。
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80 disabled:bg-muted disabled:text-muted-foreground",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground disabled:border-border disabled:bg-muted disabled:text-muted-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground disabled:bg-muted disabled:text-muted-foreground",
        // 塗りを持たないものは、無効でも塗らない。文字だけグレーへ落とす
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground disabled:text-muted-foreground dark:hover:bg-muted/50",
        // 🚨 破壊的操作は**塗らない**（憲章 §3b Coinbase / §3c WorkOS。2つの手本で食い違うのは
        // 枠線か文字かだけで、「塗らない」点は一致している）。
        // ここは**独立した確定操作**（コレクションを消す・ファイルを消す）向けの赤い枠線。
        destructive:
          "border-destructive/40 text-destructive hover:bg-destructive/10 focus-visible:border-destructive focus-visible:ring-destructive/20 disabled:border-border disabled:text-muted-foreground dark:hover:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        // **行の中の削除**向け。赤い文字だけで、枠線も塗りも持たない
        "destructive-ghost":
          "text-destructive hover:bg-destructive/10 focus-visible:border-destructive focus-visible:ring-destructive/20 disabled:text-muted-foreground dark:hover:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline disabled:text-muted-foreground",
      },
      // 🚨 高さは app/globals.css の --control-h-* だけが決める。素の h-8 を書き戻さない。
      //
      // 🚨 **SP が既定で、md から PC の値へ「下げる」**（憲章 §7 / dimensions-v2.md §3）。
      //    逆向き（PC を素に書いて SP で上げる）にしないこと。堀池さんが見ているのはモバイル。
      //    アイコンだけのボタンも SP では 44px（dimensions-v2.md §3「アイコンのみボタン → 44px」）。
      //
      // xs / icon-xs だけ 24px で据え置き。これは LocaleSwitcher と同じ**暫定の逃げ道**で、
      // design が「既知の例外」として管理している枠。v1.0 で消える。**新しく使わないこと。**
      size: {
        default:
          "h-(--control-h) gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 md:h-(--control-h-pc)",
        xs: "h-(--control-h-xs) gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-(--control-h) gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 md:h-(--control-h-pc-sm) [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-(--control-h) gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 md:h-(--control-h-pc-lg)",
        icon: "size-(--control-h) md:size-(--control-h-pc)",
        "icon-xs":
          "size-(--control-h-xs) rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-(--control-h) rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg md:size-(--control-h-pc-sm)",
        "icon-lg": "size-(--control-h) md:size-(--control-h-pc-lg)",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
