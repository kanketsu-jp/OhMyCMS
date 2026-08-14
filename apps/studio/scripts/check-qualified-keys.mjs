#!/usr/bin/env node
/**
 * 「名前空間つきの完全な辞書キー」を、**名前空間を付ける翻訳関数**へ渡していないか。
 *
 * 由来: 2026-08-15。右サイドバーの見出しが `useT("panel")(entry.titleKey)` になっていて、
 * `panel.` が二重に付き、画面に **"panel.reports.create_title" というキー文字列がそのまま出る**
 * 状態だった（polish が実測して報告。私のブラウザ検証では、押し込む側の部品がまだ無く
 * 深さ1しか描けなかったため踏めなかった）。
 *
 * 🚨 **辞書のキーが揃っているかを見る検査（check-i18n-keys / usage）では、これは捕まらない。**
 *    キーは実在する。**引き方が間違っている**だけなので、静的な突き合わせは全部緑になる。
 *    捕まえられるのは「どの翻訳関数へ渡したか」を見るこの検査だけ。
 *
 * 見る形:
 *   const t = useT("panel")   … 名前空間つき（`panel.` を前置きする）
 *   t(entry.titleKey)         … titleKey は**完全なキー**なので二重前置きになる → 違反
 *   const tKey = useT()       … 名前空間なし。これが正しい引き方
 *
 * 🚨 走るたびに、実物を2通りに壊して赤くなることを確かめてから判定を出す
 *    （緑が「異常が無い」なのか「見ていない」なのかを区別するため）。置換件数も出す。
 *
 *   node scripts/check-qualified-keys.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 「これは名前空間つきの完全なキーである」と決めてある名前。
 * 🚨 増やすときは、その名前を持つ型の doc に「完全なキー」と書いてあることを確かめること。
 * 由来: page-meta.ts の titleKey / descriptionKey / sectionKeys、right-panel.tsx の PanelEntry.titleKey。
 */
const QUALIFIED_NAMES = ["titleKey", "descriptionKey", "sectionKey"];

function findViolations(sources) {
  const violations = [];

  for (const [file, source] of Object.entries(sources)) {
    // 1) 名前空間つきで束縛された翻訳関数を集める（名前空間なしは対象外）
    const scoped = new Set();
    const bindingRe = /const\s+(\w+)\s*=\s*(?:await\s+)?(?:getT|useT)\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    let m;
    while ((m = bindingRe.exec(source)) !== null) scoped.add(m[1]);
    if (scoped.size === 0) continue;

    // 2) その関数に「完全なキー」を渡している呼び出しを探す
    for (const variable of scoped) {
      const callRe = new RegExp(`\\b${variable}\\(\\s*([^),]+?)\\s*[,)]`, "g");
      let c;
      while ((c = callRe.exec(source)) !== null) {
        const argument = c[1];
        const hit = QUALIFIED_NAMES.find((name) =>
          new RegExp(`(^|[.\\s])${name}s?\\b`).test(argument),
        );
        if (!hit) continue;
        violations.push({
          file,
          line: source.slice(0, c.index).split("\n").length,
          detail: `${variable}(${argument}) — ${hit} は完全なキーなので useT() で引く`,
        });
      }
    }
  }

  return violations;
}

function loadSources() {
  const files = globSync("{app,components}/**/*.{ts,tsx}", { cwd: root }).sort();
  const sources = {};
  for (const file of files) sources[file] = readFileSync(resolve(root, file), "utf8");
  return sources;
}

function countOccurrences(haystack, needle) {
  return needle ? haystack.split(needle).length - 1 : 0;
}

const original = loadSources();

// ── 自己検査: わざと壊して、赤くなることを確かめる（壊し方は2通り）──────────
const selfTests = [
  {
    name: "壊し方1: 右サイドバーの見出しを名前空間つきで引く（実際に踏んだ形）",
    file: "components/admin/right-panel.tsx",
    from: "tKey(top.titleKey)",
    to: "tCommon(top.titleKey)",
  },
  {
    name: "壊し方2: 概要の本文を名前空間つきで引く",
    file: "components/admin/page-info-panel.tsx",
    from: "tKey(meta.descriptionKey)",
    to: "t(meta.descriptionKey)",
  },
];

console.log("■ 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）");
let selfTestFailed = false;
for (const test of selfTests) {
  const before = original[test.file];
  const count = before === undefined ? 0 : countOccurrences(before, test.from);
  const broken = { ...original, [test.file]: (before ?? "").replaceAll(test.from, test.to) };
  const found = findViolations(broken).length;
  const ok = count > 0 && found > 0;
  console.log(`  ${ok ? "✅" : "❌"} ${test.name}  置換 ${count} 件 → 検出 ${found} 件`);
  if (count === 0) {
    console.error("     ↑ 置換が 0 件。壊せていないので、赤くならないのは当然。検査の書き方が古い。");
  }
  if (!ok) selfTestFailed = true;
}

// ── 本番の判定 ────────────────────────────────────────────────
const violations = findViolations(original);
console.log(`\n■ 判定`);
console.log(`  対象: ${Object.keys(original).length} ファイル（app/**, components/**）`);
console.log(`  完全なキーの名前: ${QUALIFIED_NAMES.join(" / ")}`);
console.log(`  違反: ${violations.length} 件`);

for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.detail}`);
}

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}

process.exit(violations.length === 0 && !selfTestFailed ? 0 : 1);
