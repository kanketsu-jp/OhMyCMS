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
import { readTracked } from "./lib/tracked-files.mjs";
// 🚨 **読み口は索引（git）から**。作業ツリーを直読みしない。
//    1 つの作業ツリーを多数のペインで共有しているので、直読みすると**他人の書きかけ**が見える
//    （2026-08-16、未追跡の `trash-*` が 2 本の検査を赤くし、触っていない人のコミットが止まった）。
//    🚨 未追跡は `null`。**「まだ入っていない」として飛ばす**（空文字にすると「中身が無い」と数え、
//    **見ていない 0** を作る）。詳しくは `scripts/lib/tracked-files.mjs`。
/** 索引から読む。未追跡なら空（＝ 走査対象から実質外れる）。**呼ぶ側で 0 件の顔を書くこと。** */
function readSrcOrEmpty(file, _enc) {
  return readTracked(file) ?? "";
}

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
let 飛ばした = 0;
for (const f of files) {
  // 🚨 未追跡（まだ `git add` していない）は**飛ばす**。空文字にすると「中身が無いファイル」として
  //    数えてしまい、**見ていない 0** を作る。
  const raw = readTracked(join(ITEMS, f));
  if (raw === null) { 飛ばした += 1; continue; }
  読めた += raw.length;
  const src = stripComments(raw);
  if (/export function itemsTable\(/.test(src)) 入口の定義 += 1;
  src.split("\n").forEach((line, i) => {
    // 入口の中の `conn(collection)` は正しい呼び出しなので除く
    if (/\bconn\(\s*collection\s*\)/.test(line)) return;
    // 🚨 **名前で決め打ちしない**（2026-08-16・実際に取りこぼした）。
    //    以前は `(trx|db)\(collection\)` だけを見ていたので、
    //    `lib/items/query.ts` の **`client(collection)`**（一覧と件数）を**素通り**していた。
    //    ＝ 引数の名前が違うだけで、**同じことをしている道が見えなくなる**。
    //    → **識別子を問わず** `なにか(collection)` を拾い、入口自身だけを除く。
    //    🚨 **直後に `.` が続くもの**（＝ そのまま問い合わせを組み立てている）だけを拾う。
    //    識別子を問わないだけだと、`isSystemTableName(collection)` や
    //    `確認済み.has(collection)` まで拾って **10 件中 8 件が誤検出**になった（実測）。
    //    🚨 **この形は見えない**（下の【鳴る】で毎回その場で確かめている）:
    //      `const q = client(collection);` … **変数へ入れてから後で組み立てる**
    const m = /(?<![.\w$])([A-Za-z_$][\w$]*)\(\s*collection\s*\)\s*\./.exec(line);
    if (m && m[1] !== "itemsTable") 違反.push(`${f}:${i + 1}  ${line.trim().slice(0, 72)}`);
  });
}

console.log(`対象: lib/items の .ts ${files.length} 本 / 読めた文字数 ${読めた}`);
console.log(
  飛ばした === 0
    ? "  未追跡で飛ばした: 0 本（＝ 全部を索引から読めている）"
    : `  🚨 未追跡で飛ばした: ${飛ばした} 本（**この分は見ていません**）`,
);
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

// 🚨 **内部列の正本が 1 箇所であること**を、ここで確かめる（toast の指摘・2026-08-16）。
//    判定を `directus_fields.readonly` だけに置くと、**守りの基準が守りの対象と同じ場所**に在る
//    ＝ その行を書き換えられるようになった日に、**印を消せば書ける**。
//    だから正本は `lib/schema/service.ts` の `INTERNAL_COLUMNS`（コード側）に置く。
//    🚨 **登録する側（table.ts）と断る側（items/service.ts）が、そこを両方読む**——
//    片方だけ直す事故が構造的に起きないように、**両方が読んでいること**を毎回見る。
// 🚨 **索引から読む**（`readSrcOrEmpty`）。ここだけ `readFileSync` にしていたので、
//    **同じ検査の中に読む口が 2 つ**在り、この 4 点だけ**他人の書きかけ**を見ていた（toast 指摘）。
const 正本 = readSrcOrEmpty(join(ITEMS, "../schema/service.ts"), "utf8");
const 断る側 = readSrcOrEmpty(join(ITEMS, "service.ts"), "utf8");
const 登録側 = readSrcOrEmpty(join(ITEMS, "table.ts"), "utf8");
const 不足 = [];
if (!/export const INTERNAL_COLUMNS/.test(正本)) 不足.push("lib/schema/service.ts に INTERNAL_COLUMNS の定義が無い");
if (!/INTERNAL_COLUMNS\.has\(/.test(断る側)) 不足.push("lib/items/service.ts が INTERNAL_COLUMNS を見ていない（書き込みを断る側）");
// 🚨 **集合そのものを読んでいること**を見る（`DELETED_AT_COLUMN` が在るかでは足りない）。
//    定数 1 本だけを見ていると、**集合に 2 個目を足した日に、登録側だけ取り残される**。
if (!/INTERNAL_COLUMNS/.test(登録側)) 不足.push("lib/items/table.ts が INTERNAL_COLUMNS を見ていない（登録する側）");
if (!/INTERNAL_COLUMNS[^=]*=\s*new Set\(\[DELETED_AT_COLUMN/.test(正本)) 不足.push("INTERNAL_COLUMNS が DELETED_AT_COLUMN を含んでいない");
if (不足.length > 0) {
  console.error(`✖ 内部列の正本が繋がっていません（${不足.length} 件）`);
  for (const v of 不足) console.error(`   🚨 ${v}`);
  process.exit(1);
}
console.log(`根拠: 内部列の正本 INTERNAL_COLUMNS を、断る側と登録側の両方が読んでいる`);

if (違反.length > 0) {
  console.error(`✖ 入口を通らずに利用者の表を開いています（${違反.length} 件）`);
  for (const v of 違反) console.error(`   ${v}`);
  console.error("  🚨 `itemsTable(conn, collection)` を通してください。");
  console.error("     通らない道が 1 本でも在ると、ソフトデリートの条件が漏れます。");
  process.exit(1);
}
console.log("判定: 入口を通らない呼び出し 0 件（＝ 直呼びが在れば上に行が出ます）");
