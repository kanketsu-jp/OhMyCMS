#!/usr/bin/env node
/**
 * 操作部品の高さを、素の数字（`h-8` など）で書いていないかを見る。
 *
 * 🚨 由来: 2026-08-15。`app/globals.css` に
 *    **「ここが唯一の定義場所。`h-8` のような素の数字を部品側に直接書かない」**と書いてあり、
 *    `button.tsx` にも「**素の h-8 を書き戻さない**」と書いてあった。
 *    **どちらもコメントだけで、止めるものが無かった。**
 *
 *    司令塔の規律12（同日）:
 *      **コメントが在ることは、守られていることではない。**
 *      **守っているコードを名指しできるか。名指しできないなら、それは願望。**
 *    → 名指しできなかったので、これを作った。
 *
 * 🚨 実際、同じ日に `--control-h-pc` を 32→36px へ動かしたとき、
 *    **`sidebar.tsx` だけ素の `h-8` のまま取り残された**（トークンを 1 つも使っていなかった）。
 *    素の数字は**トークンを動かしても追随しない**ので、こういう置き去りが静かに増える。
 *
 * ## 見るもの / 見ないもの
 *
 * 対象は **`h-` / `min-h-`** だけ。**`size-` は見ない**——
 * `size-6` はアイコンの字面の大きさで、**操作部品の高さではない**（実測で 20 箇所あり、
 * 全部を違反にすると門が死ぬ）。
 * 🚨 **コメント行は見ない**。「素の h-8 を書き戻さない」という**戒めの文自体**が
 * 違反になると、経緯が書けなくなる（`check-no-api-message.mjs` と同じ判断）。
 */
import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** 操作部品として使われうる段だけ（4px 刻みの 24〜56px）。 */
const PATTERN = /(?:^|[^a-z-])((?:min-)?h-(?:6|7|8|9|10|11|12|14))\b/g;

function isComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*");
}

function scan(sources) {
  const hits = [];
  for (const { file, text } of sources) {
    text.split("\n").forEach((line, i) => {
      if (isComment(line)) return;
      for (const m of line.matchAll(PATTERN)) {
        hits.push({ file, line: i + 1, cls: m[1], text: line.trim().slice(0, 90) });
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

// 🚨 正の対照。「在るものが在ると出る」側だけが、探し方の正しさを保証する。
const decoy = scan([{ file: "decoy.tsx", text: `<div className="flex h-8 items-center" />` }]);
console.log(`  ${decoy.length === 1 ? "✅" : "❌"} 囮1: 素の h-8  → 検出 ${decoy.length} 件`);
if (decoy.length !== 1) selfTestFailed = true;

const decoy2 = scan([{ file: "decoy.tsx", text: `<div className="min-h-11" />` }]);
console.log(`  ${decoy2.length === 1 ? "✅" : "❌"} 囮2: 素の min-h-11  → 検出 ${decoy2.length} 件`);
if (decoy2.length !== 1) selfTestFailed = true;

// 誤検出を出さないこと（トークン記法・アイコン・コメント）。
const near = scan([
  { file: "n.tsx", text: `<div className="h-(--control-h) md:h-(--control-h-pc)" />` },
  { file: "n.tsx", text: `<Icon className="size-8" />` },
  { file: "n.tsx", text: `      // 🚨 素の h-8 を書き戻さない。` },
]);
console.log(`  ${near.length === 0 ? "✅" : "❌"} 囮3: トークン記法 / size- / コメント  → 誤検出 ${near.length} 件`);
if (near.length !== 0) selfTestFailed = true;

console.log(`  ${files.length > 0 ? "✅" : "❌"} 対象を拾えている  ${files.length} ファイル`);
if (files.length === 0) selfTestFailed = true;

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  process.exit(1);
}

// ── 判定 ─────────────────────────────────────────────────────
const hits = scan(sources);
console.log(`\n■ 判定`);
console.log(`  対象: ${files.length} ファイル（app/**, components/** の .tsx）`);
console.log(`  素の高さ指定: ${hits.length} 箇所`);

if (hits.length === 0) process.exit(0);

console.error(`\n🚨 操作部品の高さを素の数字で書いています。**トークンを動かしても追随しません。**`);
for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.cls}\n      ${h.text}`);
console.error(
  "\n  直し方: `app/globals.css` の `--control-h-*` を Tailwind v4 の変数記法で引く" +
    "\n    例) h-(--control-h) md:h-(--control-h-pc)" +
    "\n  🚨 アイコンの大きさ（size-*）はここでは見ていない。**高さの話だけ**。",
);
process.exit(1);
