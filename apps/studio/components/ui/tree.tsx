import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 階層を接続線で見せる。
 *
 * 規約: `knowledge/decisions/tree-connector-lines.md`
 *
 * ## 描き方（この部品は「印」を付けるだけ。線は `app/globals.css` が描く）
 * `data-slot="tree"` / `data-slot="tree-item"` に CSS が付いている。
 * **クラスを覚えなくてよいように、属性だけで効く**形にしてある。
 *
 * ```
 * ::before  通し線  上端から下端まで、まっすぐ（角丸なし）。**最後の行には出ない**
 * ::after   肘      上端から行の縦中央まで下り、**左下で曲がって**右へ枝
 * ```
 * 🚨 **肘と通し線は別々の要素として同じ位置に重なる。** 1 要素で L 字を描かない。
 * だから**途中の行でも縦線が途切れず、どの行にも曲がりがある**。
 * （「曲がるのは最後の1本だけ」は 2026-08-15 に撤回。経緯は規約の §1）
 *
 * ## 🚨 値は暫定（堀池さんの実測待ち）
 * `--tree-turn`（曲がり半径）/ `--tree-branch`（枝）/ `--tree-indent`（字下げ）/
 * `--tree-label-gap`（罫線↔テキスト）は **`app/globals.css` のトークン**。
 * **実物の効いている半径がまだ測れていない**ので暫定値が入っている
 * （規約 §5 に「なぜ決まっていないか」と「決め方」がある）。
 * **値が来たらトークンを差し替えるだけで、この部品は触らなくてよい。**
 *
 * ## hover / active
 * 🚨 **この部品は行に hover を付けない。** 行そのものは押せる要素ではないので、
 * hover を付けると「押せそうに見えて押せない」ものが増える。
 * **押せるのは行の中に置くリンクやボタン**で、その `hover:` に `active:` を対で書くのは
 * **置く側の責任**（規約 §4。堀池さん 2026-08-15「全ての hover: には同時に active: も付与する」）。
 * 選択中の強調は `selected` で行う（色だけを変え、hover は使わない）。
 */
export function Tree({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="tree" className={cn("min-w-0", className)} {...props} />;
}

type TreeItemProps = React.ComponentProps<"li"> & {
  /**
   * 選択中の行。接続線を濃くする（堀池さん 2026-08-15「選択時に濃くする」）。
   * 🚨 **太さは変えない。濃さだけ。** 太さで状態を表すと、
   * 階層（字下げ）と状態（選択）が同じ手段で表されて読み分けられなくなる。
   */
  selected?: boolean;
};

export function TreeItem({ className, selected, ...props }: TreeItemProps) {
  return (
    <li
      data-slot="tree-item"
      // 🚨 false のときは属性ごと出さない（`data-selected="false"` は CSS では真になる）。
      data-selected={selected ? "true" : undefined}
      className={cn("min-w-0", className)}
      {...props}
    />
  );
}
