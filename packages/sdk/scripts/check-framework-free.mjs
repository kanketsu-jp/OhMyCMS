#!/usr/bin/env node
/**
 * **基礎モジュールが `react` / `next` に依存していないこと**を機械的に確かめる。
 *
 * 🚨 なぜ要るか: `@ohmycms/sdk` は素の HTML からも使える約束になっている
 *   （オーナー指示・2026-08-13「HTML などで使える基礎的なモジュール」）。
 *   誰かが `src/` のどこかで `import ... from "react"` と1行書いた瞬間に、
 *   **素の HTML で使う人に React が付いてくる**。
 *   これは**目で見て守る種類の約束ではない**ので、検査にする。
 *
 * 🚨 対照実験つき: 「禁止された import を見つけられること」を先に確かめる。
 *   でないと**検出器が何も見ていないだけ**で通ってしまう（今日それを何度も踏んだ）。
 *
 * 使い方: node scripts/check-framework-free.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** 基礎モジュールが持ち込んではいけないもの。 */
const FORBIDDEN = ["react", "react-dom", "next", "next/image", "next/link", "next/navigation"];

/** `import x from "y"` / `require("y")` / `import("y")` の "y" を集める。 */
function moduleSpecifiers(source) {
  const found = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let matched;
    while ((matched = pattern.exec(source)) !== null) found.push(matched[1]);
  }
  return found;
}

function isForbidden(specifier) {
  return FORBIDDEN.some((name) => specifier === name || specifier.startsWith(`${name}/`));
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) files.push(path);
  }
  return files;
}

// ── 🚨 対照: 検出器が本当に見つけられるか ──
const control = [
  { source: 'import { useState } from "react";', expect: true },
  { source: 'import Image from "next/image";', expect: true },
  { source: 'const x = require("react-dom");', expect: true },
  { source: 'import { assetUrl } from "./assets.js";', expect: false },
  { source: 'import type { FileRecord } from "./types.js";', expect: false },
  // 🚨 名前が似ているだけのものを誤検出しないこと
  { source: 'import { thing } from "reactive-utils";', expect: false },
  { source: 'import { thing } from "nextjs-helpers";', expect: false },
];
const controlFailures = control.filter(
  (probe) => moduleSpecifiers(probe.source).some(isForbidden) !== probe.expect,
);
if (controlFailures.length > 0) {
  console.error("🚨 検出器そのものが壊れています（対照実験に失敗）:");
  for (const probe of controlFailures) console.error(`    ${probe.source}`);
  process.exit(2);
}

// ── 本検査 ──
const violations = [];
for (const file of walk(SRC)) {
  const source = readFileSync(file, "utf8");
  for (const specifier of moduleSpecifiers(source)) {
    if (isForbidden(specifier)) {
      violations.push(`${relative(ROOT, file)} → ${specifier}`);
    }
  }
}

if (violations.length > 0) {
  console.error("🚨 基礎モジュールがフレームワークに依存しています:");
  for (const line of violations) console.error(`    ${line}`);
  console.error("");
  console.error("  @ohmycms/sdk は素の HTML からも使える約束です。");
  console.error("  React / Next.js を使うものは packages/sdk-next（@ohmycms/sdk/next）へ置いてください。");
  process.exit(1);
}

console.log(`✅ 基礎モジュールは react / next に依存していません（対照 ${control.length} 件も通過）`);
