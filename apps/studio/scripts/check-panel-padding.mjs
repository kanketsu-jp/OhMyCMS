#!/usr/bin/env node
/**
 * 右サイドバーの器にパディングを置かないことを静的に検査する。
 *
 * 母集合: components/admin/right-panel.tsx の実装ソース1ファイルだけ。
 * 見ていないもの: panel-*.tsx の中身、共有 UI、実行時に生成される className。
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./strip-comments.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "components/admin/right-panel.tsx");
const padding = /(?:^|[\s"'`])(?:p|px|py)-[^\s"'`]+/g;

function scan(source) {
  const clean = stripComments(source);
  return [...clean.matchAll(padding)].map((match) => ({
    token: match[0].trim(),
    line: clean.slice(0, match.index).split("\n").length,
  }));
}

// 自己検査: 規則が生きていれば、違反の囮は赤、無関係なクラスは緑になる。
const positive = scan('<div className="p-4" />');
const negative = scan('<div className="text-sm" />');
console.log("自己検査:");
console.log(`  ${positive.length === 1 ? "✅" : "🚨"} 囮(+): p-4 → ${positive.length} 件`);
console.log(`  ${negative.length === 0 ? "✅" : "🚨"} 囮(-): text-sm → ${negative.length} 件`);
if (positive.length !== 1 || negative.length !== 0) {
  console.error("🚨 自己検査に失敗しました。検査結果は信用できません。");
  process.exit(1);
}

const hits = scan(readFileSync(target, "utf8"));
console.log(`採取: 対象 ${target}`);
console.log("  見る範囲: right-panel.tsx の実装ソース（コメントを除く）");
if (hits.length > 0) {
  for (const hit of hits) console.error(`🚨 ${hit.token} (${target}:${hit.line})`);
  process.exit(1);
}
console.log("✅ right-panel.tsx の器に p-* / px-* / py-* はありません（0 件）");
