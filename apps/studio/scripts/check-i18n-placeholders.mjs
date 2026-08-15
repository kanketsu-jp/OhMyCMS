#!/usr/bin/env node
/**
 * ja と en で、**同じ鍵のプレースホルダが揃っているか**と、**どちらかが空でないか**を見る。
 *
 * 由来: 2026-08-16。`check-i18n-keys` は**鍵の集合**だけを見ていて、
 * **中身が食い違っていても通る**。設問290 で ja / en を同時に直す作業が控えており、
 * 「片方だけ直る」事故が実際に起きうるので、機械で見られる分だけを見る。
 *
 * 🚨 **この検査が見ていないもの**（作ったから安心、にしないため）:
 * ```
 * ❌ 「削除しました」と "Deleted" が **同じ意味か**
 *    → 🚨 **290 で守りたいのは、まさにここ。この検査は守ってくれない**
 *    → ja / en を直すときは、**人が両方を読むこと**
 * ❌ 敬体・常体、語調、長さ
 * ❌ ja と en が同じ文字列であること
 *    実測（2026-08-16）: 9 件在るが **全部 固有名詞**（OhMyCMS / SSO / 日本語 / 2 / 2）。
 *    検査にすると誤検出になるので、**意図的に見ていない**
 * ```
 *
 * 決定: `knowledge/decisions/checks-must-declare-blind-spots.md`
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** そのロケールの全文言を `名前空間.鍵` → 文字列 で返す。 */
function load(loc) {
  const dir = resolve(root, "i18n/messages", loc);
  const out = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const j = JSON.parse(readFileSync(resolve(dir, f), "utf8"));
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === "string") out[`${f.replace(/\.json$/, "")}.${k}`] = v;
    }
  }
  return out;
}

/** 文字列の中のプレースホルダ名を、並び順に依らない形で返す。 */
function placeholders(s) {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
}

/**
 * 🚨 **囮が本物を呼べるように、値を受け取る純関数にしてある**（2026-08-15 の教訓）。
 * ディスクを読むのは呼び出し側。ここに読み込みを入れると、囮は写しになる。
 */
function scan(ja, en) {
  const hits = [];
  for (const key of Object.keys(ja)) {
    if (!(key in en)) continue; // 鍵の欠落は check-i18n-keys の担当
    const a = ja[key], b = en[key];
    if (!a.trim() || !b.trim()) {
      hits.push({ key, rule: "どちらかが空", ja: a, en: b });
      continue;
    }
    if (placeholders(a) !== placeholders(b)) {
      hits.push({ key, rule: "プレースホルダが違う", ja: a, en: b });
    }
  }
  return hits;
}

// ── 自己検査 ─────────────────────────────────────────────────
console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
let selfTestFailed = false;

const ja = load("ja");
const en = load("en");
const 共通 = Object.keys(ja).filter((k) => k in en).length;

// 🚨 0 件ガード。読めていないのか、違反が無いのかを分ける。
console.log(`  ${共通 > 0 ? "✅" : "❌"} 対象を拾えている  ja ${Object.keys(ja).length} / en ${Object.keys(en).length} / 共通 ${共通} 件`);
if (共通 === 0) selfTestFailed = true;

// 🚨 囮はすべて **本物の scan() を呼ぶ**（判定を書き写さない）。
const 囮 = (a, b) => scan({ "decoy.k": a }, { "decoy.k": b });

const 検出すべき = [
  ["片方にプレースホルダが無い", "「{name}」を削除", "Delete this"],
  ["プレースホルダの名前が違う", "「{name}」を削除", 'Delete "{title}"'],
  ["ja が空", "", "Delete"],
  ["en が空", "削除", "   "],
];
const 素通り = 検出すべき.filter(([, a, b]) => 囮(a, b).length === 0);
console.log(`  ${素通り.length === 0 ? "✅" : "❌"} 囮1: 検出すべき ${検出すべき.length} 通り  → 素通り ${素通り.length} 件${素通り.length ? "（" + 素通り.map(([n]) => n).join(" / ") + "）" : ""}`);
if (素通り.length !== 0) selfTestFailed = true;

const 検出してはいけない = [
  ["同じプレースホルダ", "「{name}」を削除", 'Delete "{name}"'],
  ["順番だけ違う", "{a} と {b}", "{b} and {a}"],
  ["プレースホルダ無し同士", "削除", "Delete"],
  ["🚨 固有名詞で同一（意図的に見ていない）", "OhMyCMS", "OhMyCMS"],
];
const 誤検出 = 検出してはいけない.filter(([, a, b]) => 囮(a, b).length > 0);
console.log(`  ${誤検出.length === 0 ? "✅" : "❌"} 囮2: 検出してはいけない ${検出してはいけない.length} 通り  → 誤検出 ${誤検出.length} 件${誤検出.length ? "（" + 誤検出.map(([n]) => n).join(" / ") + "）" : ""}`);
if (誤検出.length !== 0) selfTestFailed = true;

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  process.exit(1);
}

// ── 判定 ─────────────────────────────────────────────────────
const hits = scan(ja, en);
console.log(`\n■ 判定`);
console.log(`  対象: 共通の鍵 ${共通} 件`);
for (const rule of ["プレースホルダが違う", "どちらかが空"]) {
  const n = hits.filter((h) => h.rule === rule).length;
  console.log(`    ${String(n).padStart(3)} 件  ${rule}`);
}
console.log(`  🚨 この検査は「訳の意味が同じか」は見ていない（先頭の JSDoc を読むこと）`);

if (hits.length === 0) process.exit(0);

console.error(`\n🚨 ja と en で中身が食い違っています。`);
for (const h of hits) console.error(`  [${h.rule}] ${h.key}\n      ja: ${h.ja.slice(0, 60)}\n      en: ${h.en.slice(0, 60)}`);
console.error("\n  直し方: 片方に合わせる。🚨 **プレースホルダは名前まで一致させる**（{name} と {title} は別物）。");
process.exit(1);
