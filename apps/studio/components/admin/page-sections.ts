/**
 * 右サイドバーの「項目一覧」から、ページの中の節へ飛ぶための id の付け方。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「項目一覧（そのページの**アンカーリンク集**で、これもそのページの説明書としても機能する）」
 * > 「もちろん UIUX として右サイドバーの項目一覧にも**セクションごとに遷移できる**。」
 *
 * 🚨 **id の作り方を2箇所に書かない。** 飛ぶ側（右サイドバー）と受ける側（ページの節）が
 *    別々に文字列を組み立てると、片方を直したときにリンクだけが黙って死ぬ
 *    （押しても何も起きないので、画面を見ているかぎり気づけない）。
 *    **両方この関数を通すこと。**
 *
 * 使い方（ページ側）:
 *   import { sectionAnchorId } from "@/components/admin/page-sections";
 *   <section id={sectionAnchorId("collections.list_title")}>…</section>
 */

/**
 * 節の辞書キー（`page-meta.ts` の `sectionKeys` の1つ）から、その節の id を作る。
 *
 * `"collections.list_title"` → `"section-collections-list-title"`
 *
 * 名前空間ごと使うのは、同じ画面に別の名前空間の節が並んでも衝突しないようにするため。
 */
export function sectionAnchorId(sectionKey: string): string {
  return `section-${sectionKey.replaceAll(".", "-").replaceAll("_", "-")}`;
}
