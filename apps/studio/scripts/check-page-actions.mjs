/**
 * `lib/admin/page-actions.ts`（各ページのアクションボタンの定義）が、
 * **実在するもの**だけを指しているかを確かめる。
 *
 * なぜ要るか:
 * この定数は「辞書キー」「form の id」「行き先のルート」を**文字列で**持っている。
 * どれも普通の型検査では見えない。つまり、
 *   - 辞書キーが死ぬ → **ボタンにキー文字列がそのまま出る**
 *   - form の id が消える → **「保存」を押しても黙って何も起きない**（一番たちが悪い）
 *   - 行き先が消える → 押すと 404
 * のどれも、**画面を見ているだけでは気づけない**か、気づくのが遅い。
 *
 * 🚨 この検査は「0 件でした」を返さない。**何件見たかを必ず出す**
 *    （`~/.claude/rules/count-before-you-report.md`: 異常が無い 0 と、見ていない 0 は
 *      同じ見た目になる）。対象が 0 件なら、それ自体を失敗として扱う。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const actionsPath = resolve(root, "lib/admin/page-actions.ts");
const metaPath = resolve(root, "lib/admin/page-meta.ts");

if (!existsSync(actionsPath)) {
  console.error(`■ ${actionsPath} が無い`);
  process.exit(1);
}

const src = readFileSync(actionsPath, "utf8");

// ── 定義を取り出す ──────────────────────────────────────────
// 🚨 `PAGE_ACTIONS` の中だけを見る。型定義（PageActionDef）や docstring の
//    例示を拾わないよう、開始位置を限定する。
const tableStart = src.indexOf("export const PAGE_ACTIONS");
if (tableStart < 0) {
  console.error("■ PAGE_ACTIONS が見つからない（名前を変えたなら、この検査も直すこと）");
  process.exit(1);
}
const table = src.slice(tableStart);

/** ルートのキー（`"/admin/..." : [`）を、その並び順で取り出す */
const routes = [...table.matchAll(/^ {2}"(\/admin[^"]*)":\s*\[/gm)].map((m) => m[1]);
const labelKeys = [...table.matchAll(/labelKey:\s*"([^"]+)"/g)].map((m) => m[1]);
const formIds = [...table.matchAll(/form:\s*"([^"]+)"/g)].map((m) => m[1]);
const hrefs = [...table.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);

const problems = [];

// 🚨 対象が 0 件なら「見ていない」。正常として通さない。
if (routes.length === 0) problems.push("PAGE_ACTIONS からルートを1件も取り出せなかった（検査が空振りしている）");
if (labelKeys.length === 0) problems.push("labelKey を1件も取り出せなかった（検査が空振りしている）");

// ── ① 辞書キーが ja / en の両方に実在するか ──────────────────
for (const full of new Set(labelKeys)) {
  const i = full.indexOf(".");
  if (i < 0) {
    problems.push(`labelKey "${full}" に名前空間が無い（"namespace.key" の形で書く）`);
    continue;
  }
  const ns = full.slice(0, i);
  const key = full.slice(i + 1);
  for (const locale of ["ja", "en"]) {
    const file = resolve(root, `i18n/messages/${locale}/${ns}.json`);
    if (!existsSync(file)) {
      problems.push(`labelKey "${full}" … ${locale} に名前空間 ${ns} が無い`);
      continue;
    }
    const dict = JSON.parse(readFileSync(file, "utf8"));
    if (!(key in dict)) problems.push(`labelKey "${full}" … ${locale} にキーが無い`);
  }
}

// ── ② form の id が実際の <form> に付いているか ──────────────
// 🚨 **`id="..."` を探すだけでは足りない**。div や input にも id は付く。
//    `<form ... id="x"` の形（form 要素であること）まで見る。
const sources = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(entry)) sources.push(full);
  }
})(root);

const code = sources.map((f) => readFileSync(f, "utf8")).join("\n");
if (sources.length === 0) problems.push("走査対象のソースが 0 件（検査が空振りしている）");

for (const id of new Set(formIds)) {
  // <form の直後から、最初の > までの間に id="<id>" があること
  const re = new RegExp(`<form[^>]*\\bid="${id}"`);
  if (!re.test(code)) {
    problems.push(`form id "${id}" を持つ <form> が無い（ヘッダーの送信ボタンが黙って効かなくなる）`);
  }
}

// ── ③ ルート表記が page-meta.ts と揃っているか ──────────────
// 揃っていないと「パンくずは出るのにボタンが無い」「その逆」が起きる。
let metaRoutes = new Set();
if (existsSync(metaPath)) {
  const metaSrc = readFileSync(metaPath, "utf8");
  metaRoutes = new Set(
    [...metaSrc.matchAll(/^ {2}"(\/admin[^"]*)":/gm)].map((m) => m[1]),
  );
  for (const route of routes) {
    if (!metaRoutes.has(route)) {
      problems.push(`ルート "${route}" が page-meta.ts に無い（表記ゆれ、または片方の足し忘れ）`);
    }
  }
} else {
  problems.push("lib/admin/page-meta.ts が無い（ルートの突き合わせができない）");
}

// ── ④ href の行き先が実在するルートか ───────────────────────
for (const href of new Set(hrefs)) {
  if (metaRoutes.size > 0 && !metaRoutes.has(href)) {
    problems.push(`href "${href}" が page-meta.ts に無いルートを指している（押すと 404 になりうる）`);
  }
}

// ── ⑤ 主要（primary）は 1 ルートに 1 つだけ ─────────────────
// 🚨 これは `page-actions.ts` のコメントが「**主要は 1 ページに 1 つだけ**。2 つ並べると
//    『まずこれ』が消える」と**宣言していたのに、どこも守っていなかった**もの（規律12）。
//    2026-08-15 時点で偶然 24 ルートすべて 1 件だったが、**守っていたのは規律であって機械ではない**。
//    コメントが在ることは、守られていることではない。
const primaryCounts = [];
for (const m of src.matchAll(/^ {2}"(\/admin[^"]*)": \[([\s\S]*?)^ {2}\],/gm)) {
  const [, route, block] = m;
  const count = (block.match(/role: "primary"/g) ?? []).length;
  primaryCounts.push({ route, count });
  if (count !== 1) {
    problems.push(
      `ルート "${route}" の主要ボタンが ${count} 件（1 件でなければならない）` +
        `${count === 0 ? "。既定の操作が無い" : "。どれが『まずこれ』か分からなくなる"}`,
    );
  }
}
if (primaryCounts.length === 0) {
  problems.push("主要ボタンの数を 1 ルートも数えられなかった（PAGE_ACTIONS の書き方が変わった可能性）");
}

// ── 結果 ────────────────────────────────────────────────────
console.log(`ルート: ${routes.length} 件 / labelKey: ${labelKeys.length} 件（ja・en で実在確認）`);
console.log(`form id: ${formIds.length} 件（<form> に付いているかを確認）/ href: ${hrefs.length} 件`);
console.log(`走査したソース: ${sources.length} ファイル`);
console.log(`主要ボタン: ${primaryCounts.length} ルートで数えた（各 1 件であること）`);

if (problems.length > 0) {
  console.error(`\n■ 実在しないものを指している: ${problems.length} 件`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log("問題なし（上の件数を実際に見た結果として 0 件）");
