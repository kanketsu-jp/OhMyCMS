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
 * ## 実測（2026-08-15・:3102 / SP 390 と PC 1440。幅だけでなく hover:none / pointer:coarse も切替）
 *
 * 🚨 **触る前に、この 3 つを壊していないか確かめること。**
 * ```
 * 行            通し線              肘                            ずれ
 * 1件のみ       なし                高22(SP)/16(PC) 幅16 角丸8px  —
 * 先頭          左0 幅1px 薄        左0 幅1px 薄                  0.00px
 * 途中(選択)    左0 幅1px 濃        左0 幅1px 濃                  0.00px
 * 最後          なし                薄                            —
 * ```
 * - **ずれ 0.00px** = 通し線と肘の縦線が**同じ x に重なっている**（＝ ┣ になる）。
 *   🚨 どちらかの `inset-inline-start` を動かすと**この重なりが壊れて、線が二重に見える**。
 * - **1件のみ / 最後で通し線が「なし」** = `:last-child::before { content: none }` が効いている。
 *   🚨 これを消すと、**最後の行から下へ線が突き抜ける**。
 * - **選択で薄 `lab(90.95…)`（--border）→ 濃 `lab(2.75…)`（--foreground）**。
 *   🚨 色は**通し線と肘の両方**が変わる。片方だけにすると、選択行で濃さが割れる。
 *
 * 測り方: 実物のスタイルシートの上へ `<ul data-slot="tree">` を差し込み、
 * `getComputedStyle(el, "::before" / "::after")` を読む。**ファイルは置かない**。
 * ⚠️ **算出値（used value）での確認**であって、**描画そのものを見た確認ではない**。
 * ⚠️ 色は**実際に描いている辺**（`borderInlineStart` / `borderBlockEnd`）だけを読むこと。
 *    `borderTopColor` は**幅 0 の辺の色**なので、読むと**非選択の行まで濃く見える**（実際に踏んだ）。
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
