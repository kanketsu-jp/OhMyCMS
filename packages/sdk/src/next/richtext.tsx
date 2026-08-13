/**
 * `<RichText>` — **doc JSON を React 要素へ直接組み立てる。**
 *
 * ```tsx
 * import { RichText } from "@ohmycms/sdk/next";
 * <RichText doc={item.body} className="prose" />
 * ```
 *
 * 🚨 **HTML 文字列を一度も作らない。** `generateHTML` は使わない（tiptap の指定・2026-08-14）。
 *   理由は3つとも実害:
 *     ① `generateHTML` の戻り値は**文字列**なので、React で描くには
 *        `dangerouslySetInnerHTML` に渡すしかない。**注入面が戻ってくる**。
 *        JSON を正本にした理由が「危険を1箇所に集約する」ことなのに、
 *        最後で HTML 文字列に戻すと **v0.9 の SVG と同じ経路**になる
 *     ② **SDK の利用者全員に Tiptap を背負わせる**。実測（tiptap が計測）:
 *        tiptap + prosemirror の単独チャンク **464KB raw / 141KB gzip / 118KB brotli**。
 *        本文を「読むだけ」の配信側がこれを積む理由が無い
 *     ③ **要らない**。doc JSON は小さくて安定した木なので、`type` で分岐して
 *        React 要素を返すだけで足りる。依存ゼロ
 *
 * 🚨 **許可リスト方式。知らない `type` は描かない（無視する）。**
 *   拒否リストにすると、ノードが増えるたびに漏れる。
 *   → **描ける種類しか描かないので、構造的に安全**になる。
 *
 * 判定（`isAllowedLinkHref` / `isAllowedImageSrc`）は**基礎側**（`../richtext.js`）に置いてある。
 * 素の HTML から使う人も同じ判定を通せるようにするため。
 */

import type { JSX, ReactNode } from "react";

import {
  ALLOWED_MARK_TYPES,
  ALLOWED_NODE_TYPES,
  isAllowedImageSrc,
  isAllowedLinkHref,
  type RichTextNode,
} from "../richtext.js";

export type RichTextProps = {
  /** `/api/items/...` が返す本文（doc JSON）。null でも壊れない。 */
  doc: unknown;
  className?: string;
};

/** 文字に装飾を掛ける。🚨 `link` の href は**必ず**判定を通す。 */
function applyMarks(text: string, marks: RichTextNode["marks"], key: string): ReactNode {
  if (!Array.isArray(marks) || marks.length === 0) return text;

  let node: ReactNode = text;
  for (const mark of marks) {
    const type = mark?.type;
    if (typeof type !== "string" || !ALLOWED_MARK_TYPES.has(type)) continue;

    if (type === "bold") node = <strong key={key}>{node}</strong>;
    else if (type === "italic") node = <em key={key}>{node}</em>;
    else if (type === "strike") node = <s key={key}>{node}</s>;
    else if (type === "code") node = <code key={key}>{node}</code>;
    else if (type === "link") {
      const href = mark.attrs?.href;
      // 🚨 許されない href は**リンクを剥がして文字だけ残す**（本文を消さない）。
      //   ここで `javascript:` を通すと、SDK を使うだけで XSS になる。
      if (!isAllowedLinkHref(href)) continue;
      node = (
        <a key={key} href={href} rel="noopener noreferrer nofollow">
          {node}
        </a>
      );
    }
  }
  return node;
}

function renderNode(node: RichTextNode | null | undefined, key: string): ReactNode {
  if (!node || typeof node !== "object") return null;
  const type = node.type;
  // 🚨 知らない種類は**描かない**（許可リスト方式）
  if (typeof type !== "string" || !ALLOWED_NODE_TYPES.has(type)) return null;

  if (type === "text") return applyMarks(node.text ?? "", node.marks, key);
  if (type === "hardBreak") return <br key={key} />;
  if (type === "horizontalRule") return <hr key={key} />;

  if (type === "image") {
    const src = node.attrs?.src;
    // 🚨 自分のアセット配信経路以外は描かない（SSRF と外部への閲覧履歴漏れの経路になる）
    if (!isAllowedImageSrc(src)) return null;
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
    // eslint-disable-next-line @next/next/no-img-element -- 本文中の画像は寸法が不定で next/image に載せられない
    return <img key={key} src={src} alt={alt} />;
  }

  const children = (node.content ?? []).map((child, index) => renderNode(child, `${key}.${index}`));

  switch (type) {
    case "doc":
      return children;
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading": {
      const level = Number(node.attrs?.level);
      // 🚨 h1 は画面側が持つので、本文の見出しは **h2 から**。範囲外は h2 に丸める
      const Tag = (`h${Math.min(Math.max(Number.isFinite(level) ? level : 2, 2), 6)}`) as
        "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag key={key}>{children}</Tag>;
    }
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key}>{children}</ol>;
    case "listItem":
      return <li key={key}>{children}</li>;
    case "table":
      return (
        <table key={key}>
          <tbody>{children}</tbody>
        </table>
      );
    case "tableRow":
      return <tr key={key}>{children}</tr>;
    case "tableCell":
      return <td key={key}>{children}</td>;
    case "tableHeader":
      return <th key={key}>{children}</th>;
    default:
      return null;
  }
}

/**
 * 本文を描く。
 * 🚨 **`doc` が null / 壊れていても落とさない**（何も描かないだけ）。
 *   本文が無いだけでページ全体が落ちる、という壊れ方をさせない。
 */
export function RichText({ doc, className }: RichTextProps): JSX.Element | null {
  if (!doc || typeof doc !== "object") return null;
  const rendered = renderNode(doc as RichTextNode, "rt");
  if (rendered === null) return null;
  return <div className={className}>{rendered}</div>;
}
