import type { ComponentProps } from "react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * 右サイドバーの節（1 つ分の器）。
 *
 * 堀池さん（2026-08-17 D2 原文）:
 * > 「アコーディオンの視認性：ボーダーを追加するか、開いた際に中身の要素に薄いグレーの背景色を
 * >   付けるなどして、開閉状態が分かりやすくしてください」
 *
 * 🚨 **原文の 2 つの選択肢のうち「背景」を採る。罫線は足さない。**
 *    2 日前（2026-08-15）に堀池さん自身が罫線を外している:
 *    > 「アコーディオンの上にある divider はいらない。…divider は**明確に分けるもの**なので、
 *    >   今の位置にあると**設定は別の要素と考えてしまう**」
 *    ＝ そのとき shadcn の既定 `not-last:border-b` を外し、
 *    `components/ui/accordion.tsx` に「**書き戻さないこと**」と申し送りが残っている。
 *
 *    🚨 **同じ「線」でも役目が違う**（2026-08-17 の見立て）:
 *    2 日前が拒否したのは**項目のあいだの区切り**、今日求められているのは
 *    **いま開いているのはどれか**。**後者を、2 日前の指示に触れない背景で出す。**
 *
 * 🚨 **`components/ui/accordion.tsx` を開けないこと。**
 *    あそこは「**既定が罫線を持たない**」ことそのものが守り手で、触ると守り手が消える。
 *    背景は**呼び出し側（この器）**で足す。この形は Directus も同じで、
 *    向こうも共有部品ではなく右サイドバー専用の器（`sidebar-detail.vue`）に見た目を置いている。
 *
 * 🚨 **新しい面（Surface）を作らない。** 背景は「開いている」の合図であって、
 *    別の領域の宣言ではない（`knowledge/decisions/no-nested-surfaces.md`）。
 *    だから枠線も影も付けず、`bg-muted/50` の薄い面だけにする。
 */
export function PanelSection({
  title,
  children,
  contentClassName,
  ...props
}: Omit<ComponentProps<typeof AccordionItem>, "title"> & {
  title: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    // 🚨 `group/panel-section` … 内側の内容が「親が開いているか」を見るための名前付きグループ。
    //    名前を付けるのは、他のグループ（`group/accordion-trigger` が ui 側に在る）と混ざらないため。
    <AccordionItem {...props}>
      <AccordionTrigger>{title}</AccordionTrigger>
      {/*
        🚨 **見た目は全部この中身側に持たせる**（見出しには何も乗せない）。
           堀池さん（2026-08-17 Q1 原文）:
           > 「パディングがあるので、余白が気持ち悪い。アコーディオンの見出しの背景色も一緒なので
           >   境目がわからない。パディングは親じゃなく中の要素に持たせる」
           > 追記「Divier、space-y をちゃんと活用」
        🚨 **前は `AccordionItem`（節ぜんぶ）に背景を付けていた**（D2）。
           それだと見出しにも同じ色が乗るので、**境目が消える**（Q1 の指摘そのもの）。
           ＝ 背景を中身だけに移し、**上に線を 1 本**引いて境目を出す。
        🚨 **その線は、2 日前に拒否された線とは別物**。
           あちら … 節と節のあいだ（別の領域に見えてしまう）→ いらない
           こちら … 1 つの節の中の、見出しと中身のあいだ → 今回求められている
           ＝ 節のあいだには何も足していない（`ui/accordion.tsx` は開けない・既定は罫線なし）。
      */}
      <AccordionContent
        className={[
          // 🚨 **余白は親ではなく中の要素が持つ**（堀池・2026-08-17 Q1 原文
          //    「パディングは親じゃなく中の要素に持たせる」）。
          //    親（AccordionItem）に付けると、見出しの左右にも同じ余白が乗り、
          //    畳んだときに何も無い帯だけが残る。
          "px-2 pb-2.5",
          // 🚨 **見出しと中身の境目**（同 Q1「アコーディオンの見出しの背景色も一緒なので境目がわからない」
          //    ＋ 追記「Divier、space-y をちゃんと活用」）。
          //    🚨 これは 2 日前に拒否された「項目どうしの区切り線」とは**別の線**。
          //    あちらは節と節のあいだ（別の領域に見える）。こちらは 1 つの節の中。
          //    ＝ `border-t` を**中身の上**に置き、節のあいだには何も足さない。
          "border-t pt-2.5",
          // 🚨 開いているときだけ薄い面（D2）。**見出しには乗せない**ので、境目が消えない。
          "bg-muted/50",
          // 🚨 縦の間隔は space-y で（同 Q1 の追記）。中身が複数行のとき、行間が詰まらない。
          "space-y-2",
          contentClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
