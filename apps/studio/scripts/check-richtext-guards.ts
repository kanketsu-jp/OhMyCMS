/**
 * 本文（リッチテキスト）の保存側ガードの検査。
 *
 * 打ち方: cd apps/studio && bun run check:richtext
 *
 * 🚨 **対照つきで見ること。** 危ない形が落ちることだけを確かめると、
 * 「全部落とす実装」でも通ってしまう。安全な形が**残る**ことを必ず併せて見る。
 *
 * 🚨 これは `packages/sdk` 側の `smoke:richtext`（描画側）と**対になっている**。
 * 許可リストを変えるときは両方を直すこと（sdk(w4A:p5) と約束済み）。
 */

import { readFileSync } from "node:fs";
import {
  isAllowedImageSrc,
  isAllowedLinkHref,
  sanitizeDocument,
  toPlainText,
  type RichTextDocument,
} from "../lib/richtext/document";

let failed = 0;

function check(ok: boolean, label: string): void {
  if (ok) return;
  failed += 1;
  console.error(`  ✗ ${label}`);
}

const ASSET = "/api/assets/123e4567-e89b-12d3-a456-426614174000";

// ── リンクの href ────────────────────────────────────────────
const hrefCases: [string, boolean][] = [
  // 安全（残るべき）
  ["https://example.com", true],
  ["http://example.com/a?b=1", true],
  ["mailto:a@b.jp", true],
  ["/admin/items", true],
  ["#anchor", true],
  // 危険（落ちるべき）
  ["javascript:alert(1)", false],
  ["JaVaScRiPt:alert(1)", false],
  ["java\tscript:alert(1)", false],
  ["java\nscript:alert(1)", false],
  ["  javascript:alert(1)", false],
  ["data:text/html,<script>", false],
  ["vbscript:msgbox", false],
  ["//evil.example.com", false],
  ["", false],
];
for (const [href, want] of hrefCases) {
  check(isAllowedLinkHref(href) === want, `href ${JSON.stringify(href)} は ${want ? "許可" : "拒否"} のはず`);
}

// ── 画像の src ───────────────────────────────────────────────
const srcCases: [string, boolean][] = [
  [ASSET, true],
  [`${ASSET}?width=200`, true],
  ["https://evil.example/x.png", false],
  ["/api/assets/../../etc/passwd", false],
  ["data:image/svg+xml,<svg onload=alert(1)>", false],
  ["/uploads/a.png", false],
];
for (const [src, want] of srcCases) {
  check(isAllowedImageSrc(src) === want, `src ${JSON.stringify(src)} は ${want ? "許可" : "拒否"} のはず`);
}

// ── ドキュメント全体 ─────────────────────────────────────────
const doc = sanitizeDocument({
  type: "doc",
  content: [
    { type: "script", content: [{ type: "text", text: "evil" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "危", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
        { type: "text", text: "安", marks: [{ type: "link", attrs: { href: "https://ok.jp" } }] },
        { type: "text", text: "太", marks: [{ type: "bold" }] },
        { type: "text", text: "他", marks: [{ type: "onclick", attrs: { x: "alert(1)" } }] },
      ],
    },
    { type: "image", attrs: { src: "https://evil.example/x.png" } },
    { type: "image", attrs: { src: ASSET } },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "項目" }] }] }] },
    {
      type: "table",
      content: [{
        type: "tableRow",
        content: [
          { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "見出" }] }] },
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "セル" }] }] },
        ],
      }],
    },
  ],
} as RichTextDocument);

const topTypes = (doc.content ?? []).map((node) => node.type);
const spans = (doc.content ?? [])[0]?.content ?? [];
const serialized = JSON.stringify(doc);

// 危険側
check(!topTypes.includes("script"), "知らないノード(script)が残った");
check(spans[0]?.marks?.length === 0, "javascript: のリンクが残った");
check(spans[3]?.marks?.length === 0, "知らない装飾(onclick)が残った");
check(!serialized.includes("evil.example"), "外部URLの画像が残った");
// 安全側（対照。ここが落ちると「全部消す実装」になっている）
check(spans[0]?.text === "危", "危ないリンクを剥がすときに文字まで消えた");
check(spans[1]?.marks?.[0]?.type === "link", "安全なリンクまで消えた");
check(spans[2]?.marks?.[0]?.type === "bold", "太字まで消えた");
check(spans[3]?.text === "他", "知らない装飾を剥がすときに文字まで消えた");
check(serialized.includes(ASSET), "自分のアセットの画像まで消えた");
check(topTypes.includes("bulletList") && topTypes.includes("table"), "リスト/表が消えた");
check(serialized.includes("listItem"), "listItem が消えた");
check(serialized.includes("tableHeader") && serialized.includes("tableCell"), "表のセルが消えた");
check(doc.schemaVersion === 1, "schemaVersion が付いていない");

// ── 検索用プレーンテキスト ───────────────────────────────────
const plain = toPlainText(doc);
for (const word of ["安", "太", "項目", "見出", "セル"]) {
  check(plain.includes(word), `プレーンテキストに「${word}」が無い`);
}

// ── 自作ブロックの拡張点（受入基準3） ───────────────────────
const blocks = sanitizeDocument({
  type: "doc",
  content: [
    // 登録済み。宣言に無い属性を混ぜてある
    { type: "demoBlock", attrs: { label: "見本の文字", onclick: "alert(1)", href: "javascript:alert(1)" } },
    // 未登録
    { type: "notRegisteredBlock", attrs: { label: "通ってはいけない" } },
    { type: "paragraph", content: [{ type: "text", text: "通常の本文" }] },
  ],
} as RichTextDocument);

const blockTypes = (blocks.content ?? []).map((node) => node.type);
const demo = (blocks.content ?? []).find((node) => node.type === "demoBlock");
const blocksPlain = toPlainText(blocks);

check(blockTypes.includes("demoBlock"), "登録した自作ブロックが落ちた");
check(!blockTypes.includes("notRegisteredBlock"), "登録していないブロックが通った");
check(demo?.attrs?.label === "見本の文字", "宣言した属性が消えた");
check(!(demo?.attrs && "onclick" in demo.attrs), "宣言に無い属性 onclick が残った");
check(!(demo?.attrs && "href" in demo.attrs), "宣言に無い属性 href が残った");
check(blocksPlain.includes("見本の文字"), "自作ブロックの文字が検索用に拾われていない");
check(blocksPlain.includes("通常の本文"), "通常の本文まで消えた");
check(!blocksPlain.includes("通ってはいけない"), "登録していないブロックの文字が拾われた");

// 🚨 **注意書きを守りに変える**（2026-08-15）。
// `rich-text-field.tsx` に「❌ ここを戻すなら、保存に改行が混ざらないことを先に確かめること」と
// **コメントで書いただけ**にしていた。**書いただけでは守りではない**（今日の規律12）。
// 実測: `Mod-Enter` を Tiptap へ返すと、**保存と同時に hardBreak が 1 つ増える**
// （本文の末尾に見えない改行が混ざり、`body_plain` には出ないので画面と検索がずれる）。
// 🚨 見ているのは「その割り当てがソースに在るか」だけで、**実際に押して確かめてはいない**
//    （押して確かめるのはブラウザの受入。ここは戻されたことに気づくための番人）。
const editorSource = readFileSync(
  new URL("../components/admin/rich-text-field.tsx", import.meta.url),
  "utf8",
);
check(editorSource.includes("richTextReservedKeys"), "Mod-Enter を押さえる拡張ごと消えている");
check(/"Mod-Enter":\s*\(\)\s*=>\s*true/.test(editorSource), "Mod-Enter を Tiptap へ返している（保存に改行が混ざる）");
// 🟢 対照(+): 同じ読み方で、必ず在るものが見つかること（＝ファイルを読めている）
check(editorSource.includes("StarterKit.configure"), "エディタの定義を読めていない（この検査は何も言っていない）");

const total = hrefCases.length + srcCases.length + 22 + 8 + 3;
if (failed > 0) {
  console.error(`\n本文ガード: ${failed} 件 FAILED`);
  process.exit(1);
}
console.log(`本文ガード: ${total} 件すべて PASS（危険側と安全側の対照つき）`);
