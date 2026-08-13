/**
 * **リッチテキスト（doc JSON）の値の判定。**
 *
 * 🚨 ここは**基礎**（`react` / `next` に依存しない）。素の HTML から使う人も、
 *   `@ohmycms/sdk/next` の `<RichText>` も、**同じ判定**を通す。
 *
 * 規則は `apps/studio/lib/richtext/document.ts`（tiptap 担当が正本を持つ）と**同じ内容**。
 * 🚨 **同じ規則を2箇所に書くと必ず片方が腐る**（tiptap の指摘・2026-08-14）ので、
 *   ここには**規則の写しであること**を明記し、変えるときは両方を直す。
 *   `packages/**` は tiptap の排他範囲外なので、写しはこちらの責任で保つ。
 *
 * 責任の分担（tiptap と合意・司令塔の整理に沿う）:
 *   **サーバ**が持つのは「**外へ出す値**」。後でルールを厳しくすれば、
 *     過去に保存された危ないデータも配信時に救える（JSON を正本にした最大の利点）
 *   **SDK** が持つのは「**描き方**」。許可リストで組み立てる限り、仮にサーバの検証を
 *     1つ抜けても `javascript:` の href は React に渡らない
 *   → **片方だけにすると、その片方を通らない経路が穴になる。**
 *     二重にしても実装は増えない（どちらも同じ許可リストを見るだけ）。
 */

/** doc JSON の最小の形。中身は許可リストで絞るので、ここは緩くてよい。 */
export type RichTextNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> | null }> | null;
  content?: RichTextNode[] | null;
};

export type RichTextDocument = RichTextNode & { type: "doc" };

export function isRichTextDocument(value: unknown): value is RichTextDocument {
  return typeof value === "object" && value !== null && (value as RichTextNode).type === "doc";
}

/**
 * リンクの href として許すもの。
 *
 * 🚨 **判定の前に U+0000〜U+0020 を落とす。** `java&#9;script:` のように
 *   制御文字を挟む偽装があるため（tiptap の正本と同じ）。
 * 🚨 `//evil.example` は protocol-relative なので**弾く**（SAML の戻り先で踏んだのと同じ形）。
 */
export function isAllowedLinkHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  const value = href.trim();
  if (value === "") return false;

  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (value.startsWith("#") || value.startsWith("?")) return true;

    const normalized = value.replace(/[\u0000-\u0020]/g, "").toLowerCase();
  return (
    normalized.startsWith("http://")
    || normalized.startsWith("https://")
    || normalized.startsWith("mailto:")
  );
}

/**
 * 画像の src として許すのは **自分のアセット配信経路だけ**。
 * 外部 URL を許すと、本文が SSRF と外部への閲覧履歴漏れの経路になる。
 */
const ASSET_SRC = /^\/api\/assets\/[0-9a-fA-F-]{36}(\?[^\s"']*)?$/;

export function isAllowedImageSrc(src: unknown): src is string {
  return typeof src === "string" && ASSET_SRC.test(src.trim());
}

/**
 * 描いてよいノードの種類。
 * 🚨 **許可リストにする**（tiptap の指定）。拒否リストにすると、ノードが増えるたびに漏れる。
 *   **知らない `type` は描かない**が既定。
 */
export const ALLOWED_NODE_TYPES = new Set([
  "doc",
  "paragraph",
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
  "text",
]);

/** 文字に付けてよい装飾。 */
export const ALLOWED_MARK_TYPES = new Set(["bold", "italic", "strike", "code", "link"]);

/**
 * doc JSON からプレーンテキストを取り出す（検索・抜粋・alt の既定値に使う）。
 * 🚨 **描画には使わない。** これは文字だけを拾うもので、構造は落ちる。
 */
export function richTextToPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const current = node as RichTextNode;
  if (typeof current.text === "string") return current.text;
  if (!Array.isArray(current.content)) return "";
  const separator = current.type === "doc" || current.type === "paragraph" ? "\n" : "";
  return current.content.map(richTextToPlainText).join("").concat(separator);
}
