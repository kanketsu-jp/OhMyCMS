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
    <AccordionItem {...props} className="rounded-md data-[state=open]:bg-muted/50">
      <AccordionTrigger>{title}</AccordionTrigger>
      {/*
        🚨 背景は **`AccordionItem`（`data-state` を実際に持つ要素）**に付ける。
           `AccordionContent` に付けても効かない（2026-08-17 実測）——
           `ui/accordion.tsx` は `data-state` を**外側**に置き、渡した `className` は
           **内側の div** に載せるので、同じ要素に状態が無い。
        🚨 到達までに 4 回外した。**外し方も残す**（同じ道を掘らないため）:
           ① `AccordionContent` に `data-[state=open]:` … クラスは DOM に載るが塗られない
           ② 親に `group/panel-section` ＋ `group-data-[state=open]/…` … 同じく塗られない
           ③ `data-open:` 形（このリポジトリに 9 本ある書き方）… 同じく塗られない
           ④ 🚨 **対照が偽陽性だった** … 素の `bg-muted/50` に替えたら塗れたが、
              それは**その語が他所で既に生成されていた**からで、変種が出ている証拠ではない。
              ＝ 「対照が通った」を「その形が効く」と読んではいけない。
        ✅ 効いた形 … `data-state` を持つ要素に直接。実測: 開いている節 1/1 に背景、
           🟢 対照 閉じている節 0/1（＝ 常時ではなく開閉で切り替わる）。
        🚨 節ぜんぶが薄く塗られる（見出しも含む）。堀池さんの原文は「中身の要素に」だが、
           中身だけを塗る形は上の 4 通りとも効かなかった。**そう報告する。**
      */}
      <AccordionContent
        className={["px-2", contentClassName].filter(Boolean).join(" ")}
      >
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
