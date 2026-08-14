#!/usr/bin/env node
/**
 * 参照しているのにどこにも定義が無いクラスを見つける。
 *
 * 🚨 由来: 2026-08-15。`components/ui/dropdown-menu.tsx` と `avatar.tsx` が
 * `cn-dropdown-menu-item` のような**独自クラスを 21 個参照していたのに、CSS に定義が 0 件**だった。
 * 上流（shadcn の base-nova）はこれらを自前の CSS 層で持っているが、
 * このリポジトリはその層を取り込んでいない。**結果、メニューとアバターが素のまま出ていた。**
 *
 * 🚨 **なぜ既存の検査で見つからなかったか。**
 * 面の監査は「面の深さ・高さ・あふれ」を測る。**素のままのメニュー項目も高さは正しい**ので、
 * 14 ページ × 2 幅が緑のまま壊れていた。**見た目の欠落は、寸法の検査では見えない。**
 * → 「参照はあるが定義が無い」という**別の目**が要る。
 *
 * 対象は `cn-` で始まるクラスだけ。Tailwind のクラスは対象にしない
 * （生成されるので「定義が無い」の判定ができず、誤検出だらけになる）。
 */
import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 参照側: components/**/*.tsx と app/**/*.tsx
const referenced = new Map(); // name -> [file:line]
for (const file of globSync("{app,components}/**/*.tsx", { cwd: root })) {
  const lines = readFileSync(resolve(root, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/(?<![\w-])(cn-[a-z0-9-]+)/g)) {
      if (!referenced.has(m[1])) referenced.set(m[1], []);
      referenced.get(m[1]).push(`${file}:${i + 1}`);
    }
  });
}

// 定義側: CSS 全部（@utility / .class / @apply の受け皿）
let css = "";
for (const file of globSync("{app,styles}/**/*.css", { cwd: root })) {
  css += readFileSync(resolve(root, file), "utf8") + "\n";
}

const missing = [];
for (const [name, where] of referenced) {
  // `.cn-x` か `@utility cn-x` のどちらかがあれば定義済みとみなす
  const defined = new RegExp(`(^|[^\\w-])\\.${name}(?![\\w-])|@utility\\s+${name}(?![\\w-])`, "m").test(css);
  if (!defined) missing.push({ name, where });
}

console.log(`cn-* の参照: ${referenced.size} 種類 / CSS: ${css.length} 文字`);
if (missing.length === 0) {
  console.log("定義が無いものはありません。");
  process.exit(0);
}

console.error(`\n■ 参照しているのに定義が無いクラス（画面では**素のまま**出る）: ${missing.length} 種類`);
for (const { name, where } of missing) {
  console.error(`  ${name}`);
  console.error(`      ${where.slice(0, 3).join(", ")}${where.length > 3 ? ` ほか ${where.length - 3} 箇所` : ""}`);
}
console.error(
  "\n🚨 直し方: **CSS の層を新しく作らない。** 同じリポジトリの select.tsx のように、" +
    "\n   Tailwind のクラスで書く（cn(\"…\") の中へ）。上流の CSS 層を部分的に持ち込むと、" +
    "\n   次に shadcn を更新したとき何が自分のものか分からなくなる。",
);
process.exit(1);
