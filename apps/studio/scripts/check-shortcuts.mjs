#!/usr/bin/env node
/**
 * ショートカットが被っていないかを機械的に確かめる。
 *
 * 由来（堀池・2026-08-15 原文）:「ショートカットは**被ってはいけない**」
 *
 * 🚨 **人が一覧を眺めて確かめない。** 被りは「同じ組み合わせが2つある」だけなので
 *    目で見れば分かる、と思いがちだが、増えたときに必ず見落とす。
 *
 * 🚨 走るたびに **囮（decoy）を仕込んで、それを検出できることを確かめてから**判定を出す。
 *    そうしないと「被りが無いから緑」なのか「**検出できていないから緑**」なのかが
 *    区別できない（正規表現が古くなって1件も拾えていない、が一番危ない）。
 *    合わせて **拾えた件数**も出す（0 件のまま緑になっていないかを見るため）。
 *
 *   node scripts/check-shortcuts.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "components/admin/shortcuts.ts";

/** `search: "mod+k",` の行を拾って { 名前: 組み合わせ } にする。 */
function parseShortcuts(source) {
  const entries = [];
  // SHORTCUTS の中だけを見る（formatShortcut の中の記号表を拾わないため）
  const start = source.indexOf("export const SHORTCUTS");
  const end = source.indexOf("} as const;", start);
  if (start === -1 || end === -1) return entries;
  const body = source.slice(start, end);
  for (const m of body.matchAll(/^\s*(\w+)\s*:\s*"([^"]+)"\s*,/gm)) {
    entries.push({ name: m[1], combo: m[2] });
  }
  return entries;
}

/**
 * 組み合わせを比較できる形へ揃える。
 * 修飾キーの**書き順が違うだけの同じ組み合わせ**（"mod+shift+k" と "shift+mod+k"）を
 * 別物として見逃さないため、小文字にして並べ替える。
 */
function normalize(combo) {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).sort();
  return [...modifiers, key].join("+");
}

function findConflicts(entries) {
  const seen = new Map();
  const conflicts = [];
  for (const entry of entries) {
    const key = normalize(entry.combo);
    const previous = seen.get(key);
    if (previous) {
      conflicts.push({ combo: key, names: [previous, entry.name] });
    } else {
      seen.set(key, entry.name);
    }
  }
  return conflicts;
}

const source = readFileSync(resolve(root, SOURCE), "utf8");
const entries = parseShortcuts(source);

// ── 自己検査 ─────────────────────────────────────────────────
console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");

let selfTestFailed = false;

// (1) そもそも拾えているか。0 件なら「被りが無い」ではなく「見ていない」。
const parsedOk = entries.length >= 2;
console.log(`  ${parsedOk ? "✅" : "❌"} 定義を拾えている  ${entries.length} 件`);
if (!parsedOk) {
  console.error("     ↑ 2 件未満しか拾えていない。SHORTCUTS の書き方が変わって正規表現が古い。");
  selfTestFailed = true;
}

// (2) 囮1: まったく同じ組み合わせを足す
const decoy1 = [...entries, { name: "__decoy_same", combo: entries[0]?.combo ?? "mod+k" }];
const found1 = findConflicts(decoy1).length;
console.log(`  ${found1 > 0 ? "✅" : "❌"} 囮1: 同じ組み合わせを足す  → 検出 ${found1} 件`);
if (found1 === 0) selfTestFailed = true;

// (3) 囮2: 修飾キーの**書き順だけ**を変えた同じ組み合わせ（見落としやすい形）
const submit = entries.find((e) => e.combo.includes("+shift+")) ?? entries[0];
const reordered = submit
  ? (() => {
      const parts = submit.combo.split("+");
      const key = parts.pop();
      return [...parts.reverse(), key].join("+");
    })()
  : "mod+k";
const decoy2 = [...entries, { name: "__decoy_reordered", combo: reordered }];
const found2 = findConflicts(decoy2).length;
console.log(
  `  ${found2 > 0 ? "✅" : "❌"} 囮2: 修飾キーの書き順だけ変える（${submit?.combo} → ${reordered}）  → 検出 ${found2} 件`,
);
if (found2 === 0) selfTestFailed = true;

// ── 本番の判定 ────────────────────────────────────────────────
const conflicts = findConflicts(entries);

console.log(`\n■ ショートカット一覧（${SOURCE}）`);
for (const entry of entries) {
  console.log(`  ${entry.name.padEnd(20)} ${entry.combo}`);
}
console.log(`\n  被り: ${conflicts.length} 件`);
for (const c of conflicts) {
  console.error(`  🚨 ${c.combo} が ${c.names.join(" と ")} で重複`);
}

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}

process.exit(conflicts.length === 0 && !selfTestFailed ? 0 : 1);
