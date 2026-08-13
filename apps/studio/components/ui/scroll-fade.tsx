"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** 横に流れる箱か、縦に流れる箱か */
  direction?: "horizontal" | "vertical";
} & React.ComponentProps<"div">;

/**
 * `<ScrollFade>` で包めない要素（他所の部品が描く popup など）へ、同じ振る舞いだけを付ける。
 * 🚨 **ロジックを2箇所に書かないため**にフックへ出してある。`ScrollFade` もこれを使う。
 * 付ける側は `data-scroll-fade="horizontal" | "vertical"` を自分で書くこと（CSS がそれで効く）。
 * 🚨 **`data-slot` は使わない。** 部品が既に持っている `data-slot`（select-content /
 * command-list / sheet-content …）を上書きして潰してしまう（実際に一度やった）。
 */
export function useScrollFade(
  ref: React.RefObject<HTMLElement | null>,
  direction: "horizontal" | "vertical" = "horizontal",
) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const horizontal = direction === "horizontal";
      const pos = horizontal ? el.scrollLeft : el.scrollTop;
      const size = horizontal ? el.clientWidth : el.clientHeight;
      const total = horizontal ? el.scrollWidth : el.scrollHeight;
      // 端の判定に 1px の遊びを持たせる。ブラウザは小数を返すので、
      // 厳密に 0 / 一致で比べると末尾でフェードが消えないことがある。
      el.dataset.atStart = String(pos <= 1);
      el.dataset.atEnd = String(pos + size >= total - 1);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    // 中身や幅が変わってもフェードの要否は変わる（表の列が増えた・画面が回った）
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [ref, direction]);
}

/**
 * スクロールできることを、端のフェードで見せる箱。
 *
 * 堀池さん（原文・憲章 §6）:
 * 「**スクロールできる全ての部分には scroll-fade を実装して、スクロールできることが
 *   視覚的にわかるようにする。**」
 *
 * 🚨 **マスクはスクロールする要素そのものに当てる。** 外側に巻いてはいけない
 * （`.temp/design-audit/scroll-fade-spec.md` §1）。監査は
 * **スクロールしている要素の computed style** を見るので、外に巻くと
 * **正しく作ったつもりでも赤が出続ける**。だからこの部品は
 * 「中身を包む器」ではなく、**`overflow` を持つ要素そのもの**を描く。
 *
 * 🚨 **スクロール位置を React の state にしない。** state にするとスクロールのたびに
 * 再描画が走り、憲章 §5-5（再レンダー）に触れる。`scroll` を passive で拾って
 * `dataset` を直接書き換え、**出し分けは CSS に任せる**（app/globals.css の
 * `[data-scroll-fade]`）。
 *
 * 端のフェードは**その先にまだ続きがあるときだけ**出す。常に両端を出すと、
 * 先頭でも末尾でも「まだ続きがある」と嘘をつくことになる。
 *
 * 🚨 影で代用しないこと。影は「面」なので、面の深さが1段増える（憲章 §1）。
 * 白いグラデーションを重ねる方式も使わない（ダークテーマで白い帯が出る）。
 * `mask-image` は下の色に依存しない。
 */
export function ScrollFade({
  direction = "horizontal",
  className,
  children,
  ...props
}: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  useScrollFade(ref, direction);

  return (
    <div
      ref={ref}
      data-scroll-fade={direction}
      // 初期値。effect が走る前でもフェードが出ないようにしておく
      data-at-start="true"
      data-at-end="true"
      className={cn(
        direction === "horizontal" ? "overflow-x-auto" : "overflow-y-auto",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
