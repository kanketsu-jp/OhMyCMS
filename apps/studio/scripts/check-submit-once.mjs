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

// 🚨 `method: editing ? "PATCH" : "POST"` のような**三項演算子を見落とさない**こと。
// 最初 /method:\s*["'](POST|PATCH|DELETE)["']/ と書いて、
// policy-permissions-manager.tsx の save() を丸ごと取りこぼした（17本目だった）。
// → 「`method:` と同じ行に変更系の語がある」で見る。
const MUTATION = /method:.*\b(?:POST|PATCH|DELETE)\b/;
/** 関数の入口（この行より上に遡って「誰の中か」を決める）。 */
const DECL = /(?:async\s+function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*useSubmitOnce\s*\(|useSubmitOnce\s*\(\s*async)/;

const files = globSync("{app,components}/**/*.tsx", { cwd: root }).sort();
const unguarded = [];
const guarded = [];
const suspects = [];
const pending = [];

for (const file of files) {
  const source = readFileSync(resolve(root, file), "utf8");
  const lines = source.split("\n");
  const skip = PENDING.find((p) => p.file === file);

  lines.forEach((line, i) => {
    if (!MUTATION.test(line)) return;

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
  });

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
  console.error("  useState / disabled では防げません（setState は非同期で、2回目の押下に間に合わない）。\n");
  for (const h of unguarded) console.error(`  ${h.file}:${h.line}  関数 ${h.owner}`);
  process.exit(1);
}
console.log("未防御なし。");
