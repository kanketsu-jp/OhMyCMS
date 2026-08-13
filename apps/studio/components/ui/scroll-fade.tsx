import * as React from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** 横に流れる箱か、縦に流れる箱か */
  direction?: "horizontal" | "vertical";
} & React.ComponentProps<"div">;

/**
 * スクロールできることを、端のフェードで見せる箱。
 *
 * 堀池さん（原文・憲章 §6）:
 * 「**スクロールできる全ての部分には scroll-fade を実装して、スクロールできることが
 *   視覚的にわかるようにする。**」
 *
 * 🚨 **中身は shadcn の `scroll-fade-*` ユーティリティに任せている。自作していない。**
 * `node_modules/shadcn/dist/tailwind.css` に `scroll-fade` / `-y` / `-x` / `-t` / `-b` /
 * `-l` / `-r` / `-s` / `-e` と大きさの変種が**一式ある**（`app/globals.css` が import 済み）。
 *
 * 🚨 それが **`animation-timeline: scroll(self inline)` を使うので JS が要らない**。
 * 端に着いているかの判定も、スクロールのたびの更新も、ブラウザがやる。
 * 対応していないブラウザには `@supports not` の分岐で常時フェードのフォールバックが入っている。
 *
 * 由来（2026-08-14）: 最初は `scroll` を拾って `dataset` を書き換える **JS 実装を自作した**。
 * `@shadcn/attachment` を読んでいて `scroll-fade-x` が**実在するユーティリティ**だと気づき、
 * 差し替えた。**憲章 §2「自作する前に、必ず既製があるかを確認する」を私が踏み外していた。**
 * 呼び出し側の API は変えていないので、使う側の書き方は同じ。
 *
 * 🚨 マスクは**スクロールする要素そのもの**に当たる（外側に巻かない）。
 * 影で代用しない（影は面なので深さが1段増える）。白いグラデーションも重ねない
 * （ダークテーマで白い帯が出る）。`mask-image` は下の色に依存しない。
 */
export function ScrollFade({
  direction = "horizontal",
  className,
  children,
  ...props
}: Props) {
  return (
    <div
      data-slot="scroll-fade"
      className={cn(
        direction === "horizontal"
          ? "overflow-x-auto scroll-fade-x"
          : "overflow-y-auto scroll-fade-y",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
