/**
 * 本文に差し込める「自作ブロック」の登録簿。
 *
 * 既存CMSがことごとく落ちたのがここ（`.temp/2026-08-13/specs/F8-tiptap.md` §2-2）。
 * ブロックを増やすのに「コアにハードコードする」「フォークする」しか道が無かった。
 * **このファイルに1件足すだけで増える**ようにするのが目的。
 *
 * 🚨 Next.js にも Tiptap にも依存させない（AGENTS.md §3.6）。
 * ここにあるのは**宣言だけ**で、
 *   - 保存してよいか   → `lib/richtext/document.ts` が読む
 *   - 編集画面での挙動 → `components/admin/rich-text-field.tsx` が読んで Tiptap のノードを組み立てる
 *   - 配信での描き方   → `packages/sdk` の `<RichText>` が読む
 * という形で、**3箇所が同じ宣言を見る**。
 *
 * 🚨 **足したら sdk(w4A:p5) に伝えること。** 描画側が知らないブロックは描かれず、
 * 「保存できるのに出てこない」になる（同じねじれを2回踏んでいる）。
 */

/** 属性に入れてよい値の種類。ここに無い形の値は保存時に落とす */
export type BlockAttrKind =
  /** 短い文字列。表示用の文言など */
  | "text"
  /** サイト内のアセット。`/api/assets/<uuid>` の形だけ通す */
  | "asset"
  /** 外部リンク。http / https / mailto と相対パスだけ通す */
  | "url";

export type RichTextBlockDefinition = {
  /** doc JSON の `type` になる名前。既存のノード名と衝突させない */
  name: string;
  /** 許す属性。ここに無いキーは保存時に落とす */
  attrs: Record<string, BlockAttrKind>;
  /** 本文の途中に置く塊で、中に文字を持たない（Tiptap の atom ブロック） */
  atom: true;
  /** 検索用のプレーンテキストに含める属性（無ければ検索に出ない） */
  searchableAttrs?: string[];
};

/**
 * 登録済みの自作ブロック。
 *
 * 🚨 **`demoBlock` は「拡張点が本当に動くこと」を示すための見本**（受入基準3）。
 * 外部埋め込み（YouTube 等）と、実際に使う自作ブロックは v1 でここへ足す。
 * 見本が要らなくなったら**この1件を消すだけ**で、他のどのファイルも触らずに消える。
 */
export const RICHTEXT_BLOCKS: readonly RichTextBlockDefinition[] = [
  {
    name: "demoBlock",
    attrs: { label: "text" },
    atom: true,
    searchableAttrs: ["label"],
  },
];

export function blockDefinition(name: string): RichTextBlockDefinition | undefined {
  return RICHTEXT_BLOCKS.find((block) => block.name === name);
}

export function blockNames(): string[] {
  return RICHTEXT_BLOCKS.map((block) => block.name);
}
