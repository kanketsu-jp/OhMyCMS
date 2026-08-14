/**
 * 各ページの「概要」と「項目一覧」の定義。
 *
 * 🚨 **文言そのものは持たない。辞書のキーだけを持つ**（`AGENTS.md §3.8`）。
 * ここに日本語を書くと、英語へ切り替えたときにここだけ残る。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「…右サイドバーが表示され、そこにアコーディオンで『そのページの概要
 * >   （例えば今 admin/collections にて「テーブルを作成し、フィールド定義へ進みます。」と
 * >   書いてある部分）を記載。これは **LLM がそのページを見た時や人間が見ても
 * >   その説明文で理解できるように**今よりは具体的な内容にする。
 * >   **これは Storybook にもつかう。なので const として定数化も OK**）」
 *
 * つまりこの定数は 3 箇所から読まれる:
 * - 右サイドバーの「概要」アコーディオン（**ui ペインが作る**）
 * - Storybook（ページの説明として）
 * - LLM（MCP 経由でページを説明するとき）
 *
 * 🚨 **ページ本文には出さない。** 見出しと概要をページ上部に置くのをやめたのが、この作業の発端:
 * > 「…は必要ない。理由はタイトルはパンクズで表示するのと、その下の概要は『info』アイコンで説明する。」
 */

export type PageMeta = {
  /** パンくずと右サイドバーの見出しに使う辞書キー（名前空間つき） */
  titleKey: string;
  /** 右サイドバー「概要」の本文に使う辞書キー */
  descriptionKey: string;
  /**
   * 右サイドバー「項目一覧」に出す節の辞書キー。
   * 🚨 **ページ本文の見出しとは別物**。本文から見出しを消しても、ここには残す。
   * 由来: 「`/admin/collections` の『一覧』は廃止。そもそも見てわかるので。
   * **ただし右サイドバーの項目一覧には『コレクション一覧』と表示する**。」
   */
  sectionKeys: readonly string[];
};

export const PAGE_META: Readonly<Record<string, PageMeta>> = {
  "/admin/collections": {
    titleKey: "collections.title",
    descriptionKey: "collections.subtitle",
    sectionKeys: ["collections.list_title"],
  },
};

/** パスに対応する定義。無ければ null（右サイドバーは概要を出さない） */
export function pageMeta(pathname: string): PageMeta | null {
  return PAGE_META[pathname] ?? null;
}
