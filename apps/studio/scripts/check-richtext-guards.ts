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
// 🚨 **走った件数は宣言せず、数える。**
// それまで合計は `hrefCases.length + srcCases.length + 22 + 8 + 4` と**手で足した定数**だった。
// 検査を足しても足し忘れれば数字は動かず、**「54 件すべて PASS」は測った数ではなかった**
// （CI が `GIT_DIRTY=0` を宣言していたのと同じ形。今日直したばかりのもの）。
let ran = 0;

function check(ok: boolean, label: string): void {
  ran += 1;
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
const editorSourceRaw = readFileSync(
  new URL("../components/admin/rich-text-field.tsx", import.meta.url),
  "utf8",
);

/**
 * 🚨 **コメントを実コードとして数えない**（2026-08-15 追加）。
 *
 * それまではソースをそのまま照合していたので、**実装を丸ごとコメントにしても
 * 54 件すべて PASS した**（自分で試して確認した。実測: 実装をコメント化 → `exit 0`）。
 * 同じ形が今日 3 回出ている（`active:` の規約コメントを実装として計上／棚卸しの弱い語／
 * JSDoc の使用例を実際の使用として計上）。**コメントに書いたコードは、コードに見える。**
 *
 * 🚨 素朴に `//` で切ると **文字列の中の `https://` まで切ってしまい、
 * 実コードを消して誤検出する**。なので文字列・テンプレートリテラルを見分けながら走る。
 * （このファイルの対象 `rich-text-field.tsx` に `://` は **0 件**だが、
 * 将来リンクが入っても壊れないようにしておく。）
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let 文字列: string | null = null; // 開いている引用符（' " ` のいずれか）
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (文字列) {
      if (c === "\\") { out += c + (next ?? ""); i += 2; continue; }
      if (c === 文字列) 文字列 = null;
      out += c; i += 1; continue;
    }
    if (c === '"' || c === "'" || c === "`") { 文字列 = c; out += c; i += 1; continue; }
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue; // 改行はそのまま次の周回で出る
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

// ── コメント除去そのものの自己検査 ─────────────────────────
// 🚨 **「検出されるべきもの」だけを並べない。「検出されてはいけないもの」を必ず入れる**
//    （2026-08-15）。逆方向が無いと、**過検出は永久に捕まらない**。
//    実際、私は今日 `check-build-info-guards.mjs` で
//    「正しく書いてあるものを違反と言う」過検出を出している。
{
  const 見本 = [
    '// Extension.create({ name: "richTextReservedKeys" })   ← 行コメント',
    '/* priority: 1000 とブロックコメントの中 */',
    // 🚨 **ブロックコメントの「継続行」**（2026-08-15・今日 4 回目の形として追加）。
    //    行頭の記号でコメントを判定すると、**2 行目以降が実コードとして残る**。
    '/* 🚨 継続行にも',
    '   priority: 1000 と書いてある */',
    'const url = "https://example.com//not-a-comment";',
    'const 実装 = { priority: 1000, name: "richTextReservedKeys" };',
  ].join("\n");
  const 除去後 = stripComments(見本);

  // 🚨 **囮ごとに「本物を見ているか」を書く**（2026-08-16）。
  //    検査単位で「中心の関数を殺したら落ちる」を確かめても、
  //    **落としたのが別の囮**なら、死んでいる囮には気づけない。
  //    実測（`stripComments` を「空を返す」に殺したとき、この 4 本のうち何が ❌ になったか）:
  //      ①（下の「行コメント…過検出」）  … 🚨 **❌ にならない**。純粋な否定なので、
  //                                        **空が返っても期待どおりに見える**（構造上そうなる）
  //      ②（`priority: 1000` の件数）    … ✅ ❌ になる（**件数**なので死ぬと 0 になる）
  //      ③④（実コード・文字列が残る）   … ✅ ❌ になる（正の囮）
  //    ＝ **①は「過検出を捕まえる」専用で、死活は見ていない。②③④が死活を見ている。**
  // 🚨 検出されて**はいけない**もの（コメントの中の、それらしい文字列）
  check(
    !除去後.includes("Extension.create"),
    "自己検査: 行コメントの中の `Extension.create` を実コードとして数えている（過検出）",
  );
  check(
    (除去後.match(/priority: 1000/g) ?? []).length === 1,
    "自己検査: ブロックコメントの中の `priority: 1000` まで数えている（過検出）",
  );
  // 🚨 検出されて**ほしい**もの（＝除去が効きすぎて実コードを消していないこと）
  check(
    除去後.includes('name: "richTextReservedKeys" };'),
    "自己検査: 実コードまで消している（除去が効きすぎ。これでは常に違反と出る）",
  );
  check(
    除去後.includes("https://example.com//not-a-comment"),
    "自己検査: 文字列の中の `//` をコメントとして切っている（実コードを消す）",
  );
}

const editorSource = stripComments(editorSourceRaw);
// 🟢 対照(+): コメント除去そのものが空振りしていないこと。
//    除去して**必ず短くなる**（このファイルにはコメントが在る）。同じにしかならないなら
//    除去が効いていないので、上の判定は「コメントも数える」状態に戻っている。
check(
  editorSource.length < editorSourceRaw.length,
  "コメント除去が効いていない（この検査はコメントを実装として数える状態に戻っている）",
);
check(editorSource.includes("richTextReservedKeys"), "Mod-Enter を押さえる拡張ごと消えている");
check(/"Mod-Enter":\s*\(\)\s*=>\s*true/.test(editorSource), "Mod-Enter を Tiptap へ返している（保存に改行が混ざる）");
// 🚨 **壊し方その3で見つけた穴**（2026-08-15）。拡張が在って `Mod-Enter` も書いてあるのに、
// **priority を下げるだけで StarterKit の hardBreak が先に効く**。
// 実測: `priority: 1` にすると **検査は exit 0 のまま**、保存された doc の hardBreak が **1 → 2** に増えた。
// ＝ **「在るか」だけ見ていると素通りする。効く順番まで見る。**
check(/priority:\s*1000/.test(editorSource), "Mod-Enter を押さえる拡張の priority が下がっている（StarterKit が先に効く）");
// 🟢 対照(+): 同じ読み方で、必ず在るものが見つかること（＝ファイルを読めている）
check(editorSource.includes("StarterKit.configure"), "エディタの定義を読めていない（この検査は何も言っていない）");

// 🚨 定数の足し算をやめ、実際に `check()` を通った回数を出す。
const total = ran;
if (failed > 0) {
  console.error(`\n本文ガード: ${failed} 件 FAILED`);
  process.exit(1);
}
// 🚨 0 件は「違反が無い」ではなく「**何も検査していない**」。必ず失敗にする。
if (total === 0) {
  console.error("本文ガード: 検査が 1 件も走っていない（この検査は何も言っていない）");
  process.exit(2);
}
console.log(`本文ガード: ${total} 件すべて PASS（危険側と安全側の対照つき・件数は実測）`);
