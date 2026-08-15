#!/usr/bin/env node
/**
 * `cn-*` という独自クラスを**持ち込んでいない**ことを確かめる。
 *
 * 🚨 由来: 2026-08-15。shadcn の base-nova から入れた `dropdown-menu.tsx` / `avatar.tsx` が
 *    `cn-dropdown-menu-item` のような独自クラスを **21 個参照していたのに、CSS に定義が 0 件**だった。
 *    上流はこれらを自前の CSS 層で持っているが、このリポジトリはその層を取り込んでいない。
 *    **結果、メニューとアバターが素のまま画面に出ていた**（堀池さんのスクリーンショット 2 枚）。
 *
 * 🚨 なぜ寸法の検査で見つからなかったか:
 *    面の監査は「面の深さ・高さ・あふれ」を測る。**素のままのメニュー項目も高さは正しい**ので、
 *    14 ページ × 2 幅が緑のまま壊れていた。**見た目の欠落は、寸法の検査では見えない。**
 *
 * ## この検査が見ている規則
 *
 * **このリポジトリに `cn-*` の CSS 層は無い。だから `cn-*` を書かない。**
 * 決定は `knowledge/decisions/` ではなくここに書いてある（上流の部品を入れるたびに読む場所なので）:
 * **CSS の層を新しく作らない。同じリポジトリの `select.tsx` のように Tailwind のクラスで書く。**
 * 上流の CSS 層を部分的に持ち込むと、次に shadcn を更新したとき何が自分のものか分からなくなる。
 *
 * 🚨 **以前の版は「参照はあるが定義が無いもの」を数えていた。**
 *    全部 Tailwind へ置き換えられて**参照が 0 種類になった結果、
 *    「定義が無いものはありません」と緑を返すだけの、何も見ていない検査になっていた**
 *    （2026-08-15 実測。しかも lefthook にも載っておらず、一度も走っていなかった）。
 *    → **0 が正常な規則**に据え直した。**在ること自体を違反にする。**
 */
import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PATTERN = /(?<![\w-])(cn-[a-z0-9-]+)/g;
/**
 * 🚨 **文字列を組み立てての迂回**を止める（2026-08-15）。
 *    司令塔「自分ならどう避けるか、を一度考えて、避けられるなら塞いでください」を受けて
 *    実際に試したところ、`"cn-" + "probe"` で**素通りした**（exit 0）。
 *    変数へ入れる形（`const c = "cn-x"`）は元から拾えていたが、**連結は拾えていなかった**。
 *    接頭辞だけの断片（`"cn-"` / `'cn-'`）が現れたら、組み立てを疑って落とす。
 */
const SPLIT_PATTERN = /(["'`])cn-\1/g;

/** 与えられたソース群から `cn-*` の参照を拾う。 */
function scan(sources) {
  const hits = [];
  for (const { file, text } of sources) {
    text.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(PATTERN)) {
        hits.push({ file, line: i + 1, name: m[1] });
      }
      for (const _m of line.matchAll(SPLIT_PATTERN)) {
        hits.push({ file, line: i + 1, name: 'cn-（文字列を組み立てている）' });
      }
    });
  }
  return hits;
}

const files = globSync("{app,components}/**/*.tsx", { cwd: root });
const sources = files.map((file) => ({ file, text: readFileSync(resolve(root, file), "utf8") }));

// ── 自己検査 ─────────────────────────────────────────────────
console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
let selfTestFailed = false;

// 🚨 **この囮は「探し方」しか検証していない**（2026-08-15・規律2 の追加を自分に当てた）。
//    囮は scan() に文字列を直接渡すので、**ディスクを読む経路（globSync）は通らない**。
//    ＝ **本命と同じ出どころではないが、本命の全経路も通っていない**。
//    実測: glob を壊すと **囮は「✅ 検出 1 件」のまま素通り**し、
//    落としたのは隣の「対象を拾えている **0 ファイル**」のほうだった。
//    → **囮と「対象が 0 なら落ちる」は、別々のものを守っている。両方要る。**
//      囮 = 探し方が当たっているか ／ 0 件ガード = そもそも読めているか
// 🚨 (1) 正の対照。**在るものが在ると出る**ことを確かめる。
//    「存在しない名前 → 0 件」は対照にならない（自分のパス間違い・cwd 違いも 0 を返すため。
//     司令塔の規律 2・2026-08-15 に厳しくされた）。
const decoy = scan([{ file: "decoy.tsx", text: `<div className="cn-dropdown-menu-item px-2" />` }]);
console.log(`  ${decoy.length === 1 ? "✅" : "❌"} 囮1: cn-* を1つ仕込む  → 検出 ${decoy.length} 件`);
if (decoy.length !== 1) selfTestFailed = true;

// 🚨 迂回の囮。実際にこれで素通りしていた（2026-08-15）。
const evade = scan([{ file: "d.tsx", text: `const c = "cn-" + "probe";` }]);
console.log(`  ${evade.length >= 1 ? "✅" : "❌"} 囮2: 文字列を組み立てて迂回  → 検出 ${evade.length} 件`);
if (evade.length < 1) selfTestFailed = true;

// (2) 対象を拾えているか。0 ファイルなら「違反が無い」ではなく「見ていない」。
console.log(`  ${files.length > 0 ? "✅" : "❌"} 対象を拾えている  ${files.length} ファイル`);
if (files.length === 0) selfTestFailed = true;

// (3) 似て非なるものを拾わないか（`cn(` の呼び出し・`className`）。
const near = scan([{ file: "near.tsx", text: `className={cn("px-2")} // cnx-1 concat-2` }]);
console.log(`  ${near.length === 0 ? "✅" : "❌"} 紛らわしい書き方  → 誤検出 ${near.length} 件`);
if (near.length !== 0) selfTestFailed = true;

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  process.exit(1);
}

// ── 判定 ─────────────────────────────────────────────────────
const hits = scan(sources);
const kinds = [...new Set(hits.map((h) => h.name))];
console.log(`\n■ 判定`);
console.log(`  対象: ${files.length} ファイル（app/**, components/** の .tsx）`);
console.log(`  cn-* の参照: ${hits.length} 箇所 / ${kinds.length} 種類`);

if (hits.length === 0) process.exit(0);

console.error(`\n🚨 \`cn-*\` を参照しています。**このリポジトリに その CSS 層はありません**——`);
console.error("   定義が無いまま画面に出るので、**部品が素のまま表示されます**（高さは正しいので寸法の検査では気づけません）。");
for (const h of hits.slice(0, 20)) console.error(`  ${h.file}:${h.line}  ${h.name}`);
if (hits.length > 20) console.error(`  … ほか ${hits.length - 20} 箇所`);
console.error(
  "\n  直し方: **CSS の層を新しく作らない。** 同じリポジトリの select.tsx のように" +
    "\n  Tailwind のクラスで書く（cn(\"…\") の中へ）。上流の CSS 層を部分的に持ち込むと、" +
    "\n  次に shadcn を更新したとき何が自分のものか分からなくなる。",
);
process.exit(1);
