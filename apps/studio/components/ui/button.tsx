import * as React from "react"
import { Slot } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  // 🚨 **`hover:` を足したら、同じ variant に `active:` も足すこと**（2026-08-15 堀池さん指示）。
  //    Tailwind v4 の `hover:` は `@media (hover: hover)` の中に入るので、
  //    **タッチ端末では hover の色が一度も当たらない**＝押しても色が変わらない。
  //    実測(2026-08-15・**遷移が終わるまで待ってから**読んだ値):
  //      タッチを再現(hover:none)  平常 透明 → 触れた **透明**（hover は当たらない）→ 押下 **lab(96.52)** ＋ 1px 沈む
  //      PC(hover あり)            平常 透明 → 触れた **lab(96.52)**（hover が当たる）→ 押下 **同じ色** ＋ 1px 沈む
  //    🚨 **PC では、押しても色は変わらない**（active と hover が同じ色なので）。
  //    **PC の手応えは `translate-y-px` の沈みだけ**で、色は hover の時点で既に変わっている。
  //    ＝ **`active:` はタッチのためのもの**。PC の見た目を変える変更ではない。
  //    🚨 **遷移中に読むと値が違う**（`transition-all` があるため）。
  //    120ms で読んだときは PC でも「触れた時＝透明」と出て、**hover が効いていないように見えた**（誤り）。
  //    このファイルの `hover:` 13 個のうち、対の `active:` は **0 個**だった。
  //    🚨 **幅を SP にしただけでは、この差は出ない。** `setDeviceMetricsOverride({mobile:true})` だけだと
  //    `(hover: hover)` は **true のまま**で、hover の色が当たってしまう（＝PC を細くしただけ）。
  //    `Emulation.setEmulatedMedia` で hover/pointer を差し替えて、初めて再現できる。
  //    🚨 なお base には以前から `active:not-aria-[haspopup]:translate-y-px` が在り、
  //    **押すと 1px 沈む手応えは元からある**（色が変わらないだけ）。**この行を消さないこと。**
  //    🚨 **その沈みを確かめるときは `translate` を読むこと。`transform` ではない。**
  //    Tailwind v4 は `transform` ではなく **`translate` プロパティ**を使うので、
  //    `getComputedStyle(el).transform` は**効いていても永久に `none`** を返す。
  //    実測: 押下時 `translate: "0px 0.983px"`（1px へ向かう途中。transition-all のため）。
  //    ここを読み違えて「沈みが効いていない」と報告しかけた（2026-08-15）。
  //    もう1つ条件があり、`:not([aria-haspopup])` なのでメニューを開くボタンは意図的に沈まない。
  // 🚨 無効状態を base に置かない。variant ごとに**色そのものを変える**（憲章 §3）。
  // `opacity` で薄くすると要素全体が均等に薄くなるだけで、文字と背景の関係は変わらない
  // ＝「押せない」ことが色として伝わらない。手本（X / WorkOS）はどちらもグレーへ**色を変える**。
  // base に置いてよいのは、色を持たない `pointer-events-none` だけ。
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none data-[loading=true]:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      // 🚨 色トークンは design が未確定。いまは既存の muted 系で組んである。
      // 確定したら **この variant 表の中だけ**を差し替えれば済む（呼び出し側には色を書かない）。
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80 active:bg-primary/80 disabled:bg-muted disabled:text-muted-foreground data-[loading=true]:bg-primary/80 data-[loading=true]:text-primary-foreground",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground disabled:border-border disabled:bg-muted disabled:text-muted-foreground data-[loading=true]:border-border data-[loading=true]:bg-muted data-[loading=true]:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 dark:active:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground disabled:bg-muted disabled:text-muted-foreground data-[loading=true]:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] data-[loading=true]:text-secondary-foreground",
        // 塗りを持たないものは、無効でも塗らない。文字だけグレーへ落とす
        ghost:
          "hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground disabled:text-muted-foreground data-[loading=true]:bg-muted data-[loading=true]:text-foreground dark:hover:bg-muted/50 dark:active:bg-muted/50",
        // 🚨 破壊的操作は**塗らない**（憲章 §3b Coinbase / §3c WorkOS。2つの手本で食い違うのは
        // 枠線か文字かだけで、「塗らない」点は一致している）。
        // ここは**独立した確定操作**（コレクションを消す・ファイルを消す）向けの赤い枠線。
        destructive:
          "border-destructive/40 text-destructive hover:bg-destructive/10 active:bg-destructive/10 focus-visible:border-destructive focus-visible:ring-destructive/20 disabled:border-border disabled:text-muted-foreground data-[loading=true]:border-destructive/40 data-[loading=true]:bg-destructive/10 data-[loading=true]:text-destructive dark:hover:bg-destructive/20 dark:active:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        // **行の中の削除**向け。赤い文字だけで、枠線も塗りも持たない
        "destructive-ghost":
          "text-destructive hover:bg-destructive/10 active:bg-destructive/10 focus-visible:border-destructive focus-visible:ring-destructive/20 disabled:text-muted-foreground data-[loading=true]:bg-destructive/10 data-[loading=true]:text-destructive dark:hover:bg-destructive/20 dark:active:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline active:underline disabled:text-muted-foreground data-[loading=true]:text-primary/80",
      },
      // 🚨 高さの下限は app/globals.css の --control-h-* だけが決める。素の h-8 を書き戻さない。
      //    いまの1行ボタンでは下限と同じ見た目になる。min-h は将来2行になったときに切れないための下限。
      //
      // 🚨 **SP が既定で、md から PC の値へ「下げる」**（憲章 §7 / dimensions-v2.md §3）。
      //    逆向き（PC を素に書いて SP で上げる）にしないこと。堀池さんが見ているのはモバイル。
      //    アイコンだけのボタンも SP では 44px（dimensions-v2.md §3「アイコンのみボタン → 44px」）。
      //
      // xs / icon-xs だけ 24px で据え置き。これは LocaleSwitcher と同じ**暫定の逃げ道**で、
      // design が「既知の例外」として管理している枠。v1.0 で消える。**新しく使わないこと。**
      size: {
        default:
          "min-h-(--control-h) gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 md:min-h-(--control-h-pc)",
        xs: "min-h-(--control-h-xs) gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        // 🚨 SP で幅の下限も 44px にする。行の中の操作は SP でアイコンだけになるので、
        // 高さが 44px でも**幅が 36px**まで縮んで当たり判定を割る（実測。design ⑬）。
        // 文字が出る PC では不要なので md: で外す。
        // ヘッダーの主操作は PageAction 側で sm を使うが、隣接する入力と揃える操作なので PC は既定高に戻す。
        sm: "min-h-(--control-h) min-w-(--control-h) gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-xs md:min-w-0 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 md:min-h-(--control-h-pc-sm) md:in-data-[slot=header-primary-action]:min-h-(--control-h-pc) [&_svg:not([class*='size-'])]:size-3.5",
        // 🚨 入口の画面だけ（ログイン・オンボーディング・SSO）。**操作が1つしかない画面**に限る。
        // 通常の画面で使うと、押すものが複数あるのに1つだけ大きい＝優先度の嘘になる。
        entry: "min-h-(--control-h-entry) w-full gap-2 px-4 text-base md:min-h-(--control-h-entry)",
        lg: "min-h-(--control-h) gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 md:min-h-(--control-h-pc-lg)",
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

/**
 * 全画面で使う操作ボタン。
 *
 * 🚨 触るときの注意:
 * - `hover:` と `active:` はタッチ端末の押下感のため必ず対で扱う。
 * - `loading` は見た目だけで、二重送信の制御は `hooks/use-submit-once.ts` に任せる。
 * - このファイルは Server Component からも使われるため、`"use client"` を追加しない。
 *
 * 参考: DESIGN.md §2 ／ components/ui/button.tsx
 */
function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled = false,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /**
     * 処理中の**見た目**。二重送信を止めるのはこれではない。
     *
     * 🚨 門は `hooks/use-submit-once.ts`（`useRef` の同期チェック）が持つ。
     *    `loading` は state 由来なので次のレンダーまで反映されず、**素早い2連打には間に合わない**。
     *    ここを門にすると「効いているように見えて漏れる」ものになる。
     *
     * 🚨 **この部品は内部で `onClick` を横取りしない。** 押させない働きは
     *    base の `data-[loading=true]:pointer-events-none`（CSS）だけで持つ。
     *    由来: 2026-08-15。処理中の押下を止めるために内部ハンドラを足したところ、
     *    このファイルが `"use client"` を持たないため **Server Component から使えなくなり**、
     *    `/admin/content/<collection>` が**行が1件でもあると 500**になった
     *    （行 0 件のコレクションでは 200 なので、空の DB では気づけない）。
     *    🚨 `"use client"` を足す直し方も試して**失敗している**——同居する `buttonVariants` を
     *    サーバから呼べなくなり、`/admin/collections` などが軒並み 500 になった。
     *    **この部品はサーバから使える状態を保つこと。**
     *    CSS はキーボードの Enter/Space を止めないが、**それでよい**（門は上記のとおり別にある）。
     *
     * 🚨 **将来どうしても `"use client"` が要るときの正解**（いまは採っていない）:
     *    `buttonVariants` を **`components/ui/button-variants.ts` へ切り出し**、
     *    そちらには `"use client"` を付けない。`button.tsx` は上から import して再 export する。
     *    shadcn がこの問題に出している標準の答えで、**サーバから `buttonVariants()` を
     *    呼んでいる 5 ファイル**（`app/login/page.tsx` を含む）が生き残る。
     *    🚨 **分割せずに `"use client"` だけ足すと、その 5 画面が 500 になる**
     *    （2026-08-15 実測。ログイン画面も落ちる）。
     *
     *    いま分割していない理由: **必要になっていない構造を先に入れない**
     *    （`knowledge/decisions/every-element-must-earn-its-place.md`）。
     *    `"use client"` を足すと `button.tsx` が全画面で client へ渡り、
     *    **一覧の行ごとに描かれる静的なボタンにも JS を配る**ことになる。
     *    **分割するのは「Button 自身に本当に状態やイベントが要る」と分かったとき**であって、
     *    サーバから使えないエラーを消すためではない。
     */
    loading?: boolean
  }) {
  const visualLoading = loading && !disabled
  const buttonClassName = cn(
    buttonVariants({ variant, size, className }),
    // 🚨 幅を変えない。スピナーを文字の**横に足す**と押した瞬間にボタンが伸び、
    //    カーソルの下にあるものがずれる（design 指示・実測すること）。
    //    中身は場所を占めたまま見えなくして、スピナーは絶対配置で中央に重ねる。
    visualLoading && "relative cursor-progress"
  )
  const renderContent = (content: React.ReactNode) => (
    <>
      {visualLoading ? <Spinner className="absolute" /> : null}
      {/* 🚨 `contents` は箱を作らないので、**flex の gap も並びも変わらない**
          （`<span>` で包むと子が1つになり、アイコンと文字の間の gap が消える）。
          `visibility` は継承するので、素のテキストノードにも効く。
          `opacity-0` ではなく `invisible` なのは、読み上げと当たり判定を同時に落とすため。 */}
      <span className={cn("contents", visualLoading && "invisible")}>{content}</span>
    </>
  )

  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement<{
      children?: React.ReactNode
    }>

    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant}
        data-size={size}
        aria-disabled={disabled || loading ? true : undefined}
        // 🚨 処理中は native disabled を出さず、aria-disabled と data-loading で伝える。
        //    「処理中＝働いている」と「無効＝そもそも使えない」は別の状態で、
        //    同じグレーにすると押せなかったのか処理中なのか区別が付かないため。
        //    呼び出し側が本当に disabled を渡したときは、従来どおり native disabled のグレーにする。
        data-loading={visualLoading || undefined}
        className={buttonClassName}
        {...props}
      >
        {React.cloneElement(
          child,
          undefined,
          renderContent(child.props.children)
        )}
      </Slot.Root>
    )
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      aria-disabled={disabled || loading ? true : undefined}
      // 🚨 素の <button> 経路でも、処理中は native disabled を出さない。
      //    「処理中＝働いている」と「無効＝そもそも使えない」は別の状態で、
      //    同じグレーにすると押せなかったのか処理中なのか区別が付かないため。
      //    押せなくする働きは pointer-events と click 抑止で残す。二重送信の門は use-submit-once。
      data-loading={visualLoading || undefined}
      className={buttonClassName}
      {...props}
    >
      {renderContent(children)}
    </button>
  )
}

export { Button, buttonVariants }
