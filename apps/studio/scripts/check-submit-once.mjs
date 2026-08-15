#!/usr/bin/env node
/**
 * 送信の二重発火に対する防御が入っているかを**静的に**検査する。
 *
 * 🚨 なぜ要るか:
 * 「気をつけて書く」では守れない。実際、この検査を入れる前は
 * **変更系の送信 19 本すべてが無防備で、`useRef` の使用は 0 件**だった。
 * 新しい一覧画面を足すたびに同じ穴が空くので、**落とせる検査**にする。
 *
 * 見るもの: `fetch(..., { method: "POST" | "PATCH" | "DELETE" })` を含む関数が
 *          `useSubmitOnce` を通っているか（hooks/use-submit-once.ts）。
 *
 * 🚨 見ていないもの（`checks-must-declare-blind-spots.md` の要求。塞げないことは隠さず書く）:
 *   - **別ファイルに置いた options を spread する形は拾えない**
 *     （例: 別ファイルの `const opts = { method: "POST" }` → `fetch(url, { ...opts })`）。
 *     1ファイルずつ読む静的検査なので、他ファイルの中身までは追えない。
 *   - 🚨 `lib/` を走査していないのは**別の理由**（静的解析の限界ではない）。
 *     実測すると変更系は3件だけで、中身は `lib/auth/google.ts` と `lib/drive/oauth.ts` の
 *     **サーバ側 OAuth トークン交換**——**利用者が押して送るものではない**ので、
 *     二重送信の防御が要らない。走査範囲を広げると、直しようのない指摘が3件出続ける。
 *   - `method:` の値が識別子・三項演算子・テンプレートリテラルなど**中身が読めないもの**は、
 *     実際は GET かもしれなくても「変更系かもしれない」として変更系側に倒す（過検出。2.2節）。
 *     取りこぼす側より、人が1件見に行くだけで済む過検出の側に倒している。
 *
 *   node scripts/check-submit-once.mjs
 */

import { readFileSync, globSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** まだ移行していないファイル。🚨 減らすためのリストであり、増やすためのものではない。 */
const PENDING = [
  // ui(w4A:p6) の担当。面の移行が終わってから同じ手当てをする
  { file: "components/admin/bug-report-form.tsx", owner: "ui(p6)" },
  { file: "components/admin/settings-manager.tsx", owner: "ui(p6)" },
  { file: "components/admin/notifications-manager.tsx", owner: "ui(p6)" },
];

/** 関数の入口（この行より上に遡って「誰の中か」を決める）。 */
const DECL = /(?:async\s+function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*useSubmitOnce\s*\(|useSubmitOnce\s*\(\s*async)/;

/** `method:` を探すキー。直後の空白（改行を含む）は snippet 側で正規化して読むので、ここでは追わない。 */
const METHOD_KEY = /method:\s*/g;
/** `method:` の値を読むのに十分な長さ。テンプレート・三項演算子は先頭の1文字が読めれば判定できる。 */
const SNIPPET_HORIZON = 300;

/**
 * `method:` の値を判定する。
 * リテラル文字列（`'` か `"`）なら中身を読んで POST/PATCH/DELETE かどうかで決める。
 *
 * 🚨 識別子・三項演算子・テンプレートリテラル（`` ` ``）など**中身が読めないもの**は、
 * 変更系かもしれないので変更系として扱う（過検出に倒す。取りこぼす側より安全 — 2.2節）。
 * 三項演算子（`method: editing ? "PATCH" : "POST"`）を読み落として1本取りこぼした前科が
 * あるので（33行目のコメント参照）、「読めないなら疑う」を既定にする。
 */
function isMutationValue(value) {
  const quoted = /^(['"])((?:\\.|(?!\1).)*)\1/.exec(value);
  if (quoted) return /^(?:POST|PATCH|DELETE)$/.test(quoted[2]);
  return true;
}

/**
 * ソースの中の `method:` を全部拾い、変更系と判定された出現の**行番号**（元のソース基準・0始まり）を返す。
 *
 * 🚨 `method:` の直後だけを空白ひとつに正規化した「照合専用の文字列」（snippet）を作って判定する。
 * **行番号は正規化していない元のソースから数える**（正規化した文字列から行を数えると、
 * 潰した改行の分だけ報告の行番号がずれて、直す人が使えなくなる）。
 */
function findMutationLines(source) {
  const lines = new Set();
  METHOD_KEY.lastIndex = 0;
  let m;
  while ((m = METHOD_KEY.exec(source))) {
    const raw = source.slice(m.index, m.index + SNIPPET_HORIZON);
    const snippet = raw.replace(/\s+/g, " ");
    const prefix = /^method:\s*/.exec(snippet);
    const value = snippet.slice(prefix[0].length);
    if (isMutationValue(value)) {
      lines.add(source.slice(0, m.index).split("\n").length - 1);
    }
  }
  return [...lines].sort((a, b) => a - b);
}

const files = globSync("{app,components}/**/*.tsx", { cwd: root }).sort();
const unguarded = [];
const guarded = [];
const suspects = [];
const pending = [];

for (const file of files) {
  const source = readFileSync(resolve(root, file), "utf8");
  const lines = source.split("\n");
  const skip = PENDING.find((p) => p.file === file);

  for (const i of findMutationLines(source)) {
    // 直前の関数入口まで遡る
    let owner = null;
    for (let j = i; j >= 0 && i - j < 60; j -= 1) {
      const m = DECL.exec(lines[j]);
      if (!m) continue;
      owner = m[1] ? { kind: "bare", name: m[1] } : { kind: "guarded", name: m[2] ?? "(無名)" };
      break;
    }

    const entry = { file, line: i + 1, owner: owner?.name ?? "(不明)" };
    if (skip) pending.push({ ...entry, who: skip.owner });
    else if (!owner || owner.kind === "bare") unguarded.push(entry);
    else guarded.push(entry);
  }

  // 🚨 行ごとの操作で keyOf を忘れていないか（1行を消している間に他の行が押せなくなる）。
  // `NAME.run(引数あり)` を使っているのに `NAME.isPending(` が一度も出てこないものを疑う。
  for (const m of source.matchAll(/\b(\w+)\.run\(\s*[^)\s]/g)) {
    const name = m[1];
    if (source.includes(`${name}.isPending(`)) continue;
    if (suspects.some((s) => s.file === file && s.name === name)) continue;
    suspects.push({ file, name });
  }
}

console.log(`防御済み: ${guarded.length} 件 / 未防御: ${unguarded.length} 件 / 移行待ち: ${pending.length} 件`);

if (suspects.length > 0) {
  console.warn("\n■ 行ごとの操作で keyOf を忘れている疑い（引数つきで呼んでいるのに isPending を使っていない）");
  console.warn("  行ごとの削除で鍵を共有すると、1行を消している間に他の行が押せなくなります。");
  for (const s of suspects) console.warn(`  ${s.file}  ${s.name}`);
}

if (pending.length > 0) {
  console.log("\n■ 移行待ち（担当が別）");
  for (const p of pending) console.log(`  ${p.file}:${p.line}  ${p.owner}  ← ${p.who}`);
}

if (unguarded.length > 0) {
  console.error("\n■ 二重送信の防御がありません");
  console.error("  変更系の送信は hooks/use-submit-once.ts の useSubmitOnce を通してください。");
  console.error("  useState / disabled では防げません（setState は非同期で、2回目の押下に間に合いません）。\n");
  for (const h of unguarded) console.error(`  ${h.file}:${h.line}  関数 ${h.owner}`);
} else {
  console.log("未防御なし。");
}

// ── 自己検査（この検査が本当に検出できるかを毎回その場で確かめる。check-user-label-leak.mjs と同じ書式）──
// 🚨 ディスクに .tsx を作らない（共有ツリーに置き忘れると他人のコミットに混ざる）。
//    既存のソース文字列（下の BASELINE）への置換で壊す。

/** 壊す元になる、変更系の印を一つも含まない素直な fetch。ここへ壊し方を差し込む。 */
const BASELINE = [
  "export function SaveButton() {",
  "  async function handleSave() {",
  '    await fetch("/api/items", {',
  '      headers: { "content-type": "application/json" },',
  "    });",
  "  }",
  "  return null;",
  "}",
  "",
].join("\n");

const NEEDLE = '      headers: { "content-type": "application/json" },';

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const baselineDetections = findMutationLines(BASELINE).length; // 壊す前は 0 のはず

const selfTests = [
  {
    name: '壊し方1: 素直な形（method: "POST"）を差し込む',
    apply(base) {
      const count = countOccurrences(base, NEEDLE);
      const after = base.replaceAll(NEEDLE, `      method: "POST",\n${NEEDLE}`);
      return { after, count };
    },
  },
  {
    name: "壊し方2: 変数で渡す形（method: VERB）を差し込む",
    apply(base) {
      const count = countOccurrences(base, NEEDLE);
      const after = base.replaceAll(NEEDLE, `      method: VERB,\n${NEEDLE}`);
      return { after, count };
    },
  },
  {
    name: "壊し方3: 改行を挟んだ形（method: の直後で改行してから値）を差し込む",
    apply(base) {
      const count = countOccurrences(base, NEEDLE);
      const after = base.replaceAll(NEEDLE, `      method:\n        "POST",\n${NEEDLE}`);
      return { after, count };
    },
  },
];

console.log("\n■ 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）");
let selfTestFailed = false;
for (const test of selfTests) {
  const { after, count } = test.apply(BASELINE);
  const detected = findMutationLines(after).length - baselineDetections;
  const ok = count > 0 && detected === count;

  console.log(`  ${ok ? "✅" : "❌"} ${test.name}  置換 ${count} 件 → 検出 ${detected} 件`);
  if (count === 0) {
    console.error("     ↑ 置換が 0 件。壊せていないので、検出 0 件は何も確かめていない。");
  }
  if (!ok) selfTestFailed = true;
}

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}

process.exit(unguarded.length === 0 && !selfTestFailed ? 0 : 1);
