#!/usr/bin/env node
/**
 * 利用者が作った表を、入口（`itemsTable`）を通さずに開いていないかの検査。
 *
 * 🚨 **なぜ要るか。** 設問288 A で「利用者が作った表もソフトデリートの対象」と決まった。
 * ＝ **消えた行を読まない条件**が、表を開くすべての場所に要る。
 * 各所に手で書かせると、**1 箇所でも漏れたときに「消したはずの行が画面に出る」**——
 * しかも**その画面だけ**なので気づきにくい。
 * → 開く場所を `lib/items/service.ts` の `itemsTable()` 1 本にして、**通らない道をここで止める**。
 *
 * 🚨 **この検査が見ていない範囲**（【書いただけ】。古くなっても鳴りません）:
 *   1. **`lib/items/` の外** … 他のディレクトリから利用者の表を開いたら見えない
 *   2. **文字列で組み立てた表名** … `raw()` の中は読んでいない
 *      （【測った 2026-08-16】`lib/items/` の `raw(` は **0 件**。**いまは抜け道が無い**）
 *   3. **入口の中身** … `itemsTable()` が正しい条件を持っているかは見ていない（在るかだけ）
 *
 * 使い方: `node scripts/check-items-entry.mjs`（違反があれば exit 1）
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ITEMS = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "items");

/** 🚨 コメントを実コードとして数えない（「書いただけ」を違反にしない／見逃さない）。 */
function stripComments(source) {
  let out = "", i = 0, quote = null, block = false;
  while (i < source.length) {
    const c = source[i], n = source[i + 1];
    if (block) { if (c === "*" && n === "/") { block = false; i += 2; } else i += 1; continue; }
    if (quote) {
      if (c === "\\") { out += c + (n ?? ""); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i += 1; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i += 1; continue; }
    if (c === "/" && n === "/") { while (i < source.length && source[i] !== "\n") i += 1; continue; }
    if (c === "/" && n === "*") { block = true; i += 2; continue; }
    out += c; i += 1;
  }
  return out;
}

const files = readdirSync(ITEMS).filter((f) => f.endsWith(".ts"));
if (files.length === 0) {
  console.error("✖ lib/items/ に .ts が 1 本もありません。この検査は何も見ていません。");
  process.exit(2);
}

let 読めた = 0;
const 違反 = [];
let 入口の定義 = 0;
for (const f of files) {
  const raw = readFileSync(join(ITEMS, f), "utf8");
  読めた += raw.length;
  const src = stripComments(raw);
  if (/export function itemsTable\(/.test(src)) 入口の定義 += 1;
  src.split("\n").forEach((line, i) => {
    // 入口の中の `conn(collection)` は正しい呼び出しなので除く
    if (/\bconn\(\s*collection\s*\)/.test(line)) return;
    const m = /\b(trx|db)\(\s*collection\s*\)/.exec(line);
    if (m) 違反.push(`${f}:${i + 1}  ${line.trim().slice(0, 72)}`);
  });
}

console.log(`対象: lib/items の .ts ${files.length} 本 / 読めた文字数 ${読めた}`);
// 🚨 読めた量が 0 なら「違反 0 件」ではなく「何も見ていない」。
if (読めた < 5000) {
  console.error(`✖ 読めた文字数が ${読めた} しかありません（下限 5000）`);
  console.error("  🚨 違反 0 件より先に、読み込みか走査の範囲が壊れていることを疑ってください。");
  process.exit(2);
}
// 🟢 対照(+): 入口の定義そのものが見つかること（＝この検査がファイルを読めている証拠）
if (入口の定義 !== 1) {
  console.error(`✖ itemsTable の定義が ${入口の定義} 件（1 でない）`);
  console.error("  🚨 入口が消えたか、この検査が読めていません。判定は出しません。");
  process.exit(2);
}
console.log(`根拠: itemsTable の定義 ${入口の定義} 件（＝読めている）`);

if (違反.length > 0) {
  console.error(`✖ 入口を通らずに利用者の表を開いています（${違反.length} 件）`);
  for (const v of 違反) console.error(`   ${v}`);
  console.error("  🚨 `itemsTable(conn, collection)` を通してください。");
  console.error("     通らない道が 1 本でも在ると、ソフトデリートの条件が漏れます。");
  process.exit(1);
}
console.log("判定: 入口を通らない呼び出し 0 件（＝ 直呼びが在れば上に行が出ます）");
