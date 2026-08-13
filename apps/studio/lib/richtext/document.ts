/**
 * 本文（リッチテキスト）のドキュメント操作。
 *
 * 保存形式は **ProseMirror の doc JSON**（決定 D-F8-01）。HTML は保存しない。
 * 🚨 JSON は「自動的に安全」ではない。link の href に `javascript:` を入れられるので、
 * **危険は「保存時の構造検証」と「配信時の変換」の2箇所で潰す**。ここは前者を担う。
 *
 * 🚨 Next.js に依存させない（AGENTS.md §3.6）。React への変換は components 側が持つ。
 */

import {
  blockDefinition,
  blockNames,
  type RichTextBlockDefinition,
} from "./blocks";

/** doc に必ず持たせる版番号。ノードの形を変えたら上げて、逐次マイグレーションを書く */
export const RICHTEXT_SCHEMA_VERSION = 1;

/**
 * 本文の相方になる、検索用のプレーンテキスト列の名前。
 *
 * 🚨 **`text` 型で作ること。** `lib/search/service.ts` の `isSearchableColumn` が
 * `/char|text|citext/` を見ているので、text なら横断検索(F2-J)が**無改修で拾う**。
 * jsonb のままだと ILIKE が落ちる（`jsonb ~~* unknown` でエラーになる）ので、
 * 本文そのものは検索できない。だから相方の列を持つ。
 */
export function plainColumnName(field: string): string {
  return `${field}_plain`;
}

export type RichTextMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
};

export type RichTextDocument = RichTextNode & {
  type: "doc";
  schemaVersion?: number;
};

/**
 * 保存してよいノードの種類。
 *
 * 🚨 **描画側（`packages/sdk` の `<RichText>`）と同じ集合であること。**
 * こちらが緩いと「保存できるのに描かれない」、こちらが厳しいと「書いたのに消える」。
 * 変えるときは sdk(w4A:p5) へ一声かける約束になっている。
 *
 * 見出しは editor 側で h2〜h4 に絞ってある（h1 は画面が持つ）。
 */
const BUILTIN_NODE_TYPES = [
  "doc",
  "paragraph",
  "text",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
  "hardBreak",
  "image",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
];

/**
 * 組み込み + 自作ブロック（`lib/richtext/blocks.ts` の登録簿）。
 * 🚨 自作ブロックを増やすときに**このファイルは触らない**。登録簿に1件足すだけで通るようにしてある。
 */
const ALLOWED_NODE_TYPES = new Set([...BUILTIN_NODE_TYPES, ...blockNames()]);

/**
 * 保存してよい装飾の種類。
 * 🚨 知らない装飾は**剥がすだけで、文字は残す**（ノードのように丸ごと落とさない）。
 * 下線は持たせていない（リンクと見分けが付かなくなるため・design の決定）。
 */
const ALLOWED_MARK_TYPES = new Set([
  "bold",
  "italic",
  "strike",
  "code",
  "link",
]);

/** 段落の区切りとして扱うノード（プレーンテキスト化で改行を入れる相手） */
const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "horizontalRule",
  "tableRow",
]);

export function isRichTextDocument(value: unknown): value is RichTextDocument {
  return (
    typeof value === "object"
    && value !== null
    && (value as RichTextNode).type === "doc"
  );
}

export function emptyDocument(): RichTextDocument {
  return {
    type: "doc",
    schemaVersion: RICHTEXT_SCHEMA_VERSION,
    content: [{ type: "paragraph" }],
  };
}

/**
 * リンクの href として許すもの: http / https / mailto と、サイト内の相対パス。
 * 🚨 `javascript:` `data:` `vbscript:` は拒否する（保存させない）。
 */
export function isAllowedLinkHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  const value = href.trim();
  if (value === "") return false;

  // 相対パス（サイト内リンク）。`//evil.example` は protocol-relative なので弾く
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (value.startsWith("#") || value.startsWith("?")) return true;

  // 🚨 `java&#9;script:` のように制御文字を挟む偽装があるので、
  // 判定の前に空白・制御文字（U+0000〜U+0020）を落としてから前方一致を見る。
  const normalized = value.replace(/[\u0000-\u0020]/g, "").toLowerCase();
  return (
    normalized.startsWith("http://")
    || normalized.startsWith("https://")
    || normalized.startsWith("mailto:")
  );
}

/**
 * 画像の src として許すのは **自分のアセット配信経路だけ**。
 * 外部 URL を許すと、本文が SSRF と外部への閲覧履歴漏れの経路になる（§10-4）。
 */
const ASSET_SRC = /^\/api\/assets\/[0-9a-fA-F-]{36}(\?[^\s"']*)?$/;

export function isAllowedImageSrc(src: unknown): src is string {
  return typeof src === "string" && ASSET_SRC.test(src.trim());
}

/**
 * 保存前の構造の検証。**壊れた値を落として返す**（例外を投げない）。
 * - 許されない href のリンクマークは剥がす（文字は残す）
 * - 許されない src の画像ノードは丸ごと落とす
 */
export function sanitizeDocument(doc: RichTextDocument): RichTextDocument {
  return {
    ...doc,
    type: "doc",
    schemaVersion: RICHTEXT_SCHEMA_VERSION,
    content: sanitizeNodes(doc.content ?? []),
  };
}

function sanitizeNodes(nodes: RichTextNode[]): RichTextNode[] {
  const result: RichTextNode[] = [];

  for (const node of nodes) {
    if (!node || typeof node.type !== "string") continue;

    // 🚨 知らない種類は**保存しない**。拒否リストにすると増えるたびに漏れる。
    // ここを描画側（packages/sdk の RichText）と同じ集合に保つこと。
    // 片方だけ緩いと「保存はできるのに描かれない」ねじれになる。
    if (!ALLOWED_NODE_TYPES.has(node.type)) continue;

    if (node.type === "image" && !isAllowedImageSrc(node.attrs?.src)) {
      continue;
    }

    const block = blockDefinition(node.type);
    if (block) {
      // 自作ブロックは、登録簿が宣言した属性しか持てない。
      // 宣言に無いキーは落とす（`onclick` のようなものを attrs に忍ばせられないように）
      result.push({ ...node, attrs: sanitizeBlockAttrs(block, node.attrs) });
      continue;
    }

    const marks = node.marks?.filter((mark) => {
      if (!mark || !ALLOWED_MARK_TYPES.has(mark.type)) return false;
      if (mark.type !== "link") return true;
      return isAllowedLinkHref(mark.attrs?.href);
    });

    result.push({
      ...node,
      ...(marks ? { marks } : {}),
      ...(node.content ? { content: sanitizeNodes(node.content) } : {}),
    });
  }

  return result;
}

/**
 * 自作ブロックの属性を、登録簿の宣言どおりに削る。
 * 宣言に無いキーは落とし、値の種類が合わないものも落とす。
 */
function sanitizeBlockAttrs(
  block: RichTextBlockDefinition,
  attrs: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!attrs) return result;

  for (const [key, kind] of Object.entries(block.attrs)) {
    const value = attrs[key];
    if (value === undefined || value === null) continue;

    if (kind === "text") {
      if (typeof value === "string") result[key] = value;
      continue;
    }
    if (kind === "asset") {
      if (isAllowedImageSrc(value)) result[key] = value;
      continue;
    }
    if (kind === "url") {
      if (isAllowedLinkHref(value)) result[key] = value;
    }
  }
  return result;
}

/**
 * 検索用のプレーンテキスト。
 * 🚨 これは `<field>_plain` 列へ**本文と同じ更新の中で**書く。
 * 片方だけ古くなると、検索結果と中身が食い違う。
 */
export function toPlainText(doc: unknown): string {
  if (!isRichTextDocument(doc)) return "";
  const parts: string[] = [];
  collectText(doc, parts);
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectText(node: RichTextNode, parts: string[]): void {
  if (typeof node.text === "string") parts.push(node.text);

  // 🚨 自作ブロックは中に文字を持たない（atom）ので、放っておくと検索に出ない。
  // 登録簿が `searchableAttrs` で指定した属性を、検索用の文字として拾う。
  const block = blockDefinition(node.type);
  if (block?.searchableAttrs) {
    for (const key of block.searchableAttrs) {
      const value = node.attrs?.[key];
      if (typeof value === "string" && value !== "") parts.push(value, "\n");
    }
  }

  for (const child of node.content ?? []) {
    collectText(child, parts);
  }

  // 表のセルは同じ行の中で続けて読めるよう空白で、それ以外の塊は改行で区切る
  if (node.type === "tableCell" || node.type === "tableHeader") parts.push(" ");
  else if (BLOCK_TYPES.has(node.type)) parts.push("\n");
}
