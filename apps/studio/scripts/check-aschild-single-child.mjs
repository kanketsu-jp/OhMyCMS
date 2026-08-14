#!/usr/bin/env node
/**
 * `asChild` を付けた要素が、**子をちょうど1つ**持っているかを見る。
 *
 * 🚨 由来: 2026-08-15。Base UI から Radix へ移した直後、`/admin/settings/users` が
 * Next のエラー画面（"This page couldn't load"）になっていた。原因は
 *
 *     Error: Slot failed to slot onto its children.
 *            Expected a single React element child or `Slottable`.
 *
 * `components/ui/pagination.tsx` の `PaginationPrevious` が **アイコン + 文字の2つ**を
 * `asChild` の中へ渡していた。
 * 🚨 **Base UI の `render={}` は複数の子を許していたので、移行するまで壊れなかった。**
 * つまり「移行後に一度も開いていない画面」に同じ地雷が残っている。
 *
 * 🚨 なぜ既存の検査で見つからないか:
 * - `tsc` は通る（型としては children を受け取れる）
 * - `eslint` も通る
 * - 面の監査は**ページが落ちている**ことに気づけるが、**開いた画面しか見ない**。
 *   28 箇所ある `asChild` のうち、開かない画面のものは緑のまま。
 * → 「実行しなくても分かること」は静的に見る。
 *
 * 判定は保守的にする（**誤検出で人を疲れさせない**）:
 *   `<X asChild …> A B </X>` のように**要素が2つ以上**並ぶものだけを落とす。
 *   式（`{cond && <A/>}`）や文字だけの子は、実行時に1つになりうるので落とさない。
 */
import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bad = [];
let checked = 0;

for (const file of globSync("{app,components}/**/*.tsx", { cwd: root })) {
  const src = readFileSync(resolve(root, file), "utf8");
  // `asChild` を含む開始タグを探し、その要素の中身を粗く取り出す
  const re = /<([A-Z][\w.]*)\b([^>]*\basChild\b[^>]*)>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    checked++;
    const [, tag] = m;
    const after = src.slice(m.index + m[0].length);
    const close = after.indexOf(`</${tag}>`);
    if (close < 0) continue; // 自己閉じ（<X asChild … />）は子を持たない
    const inner = after.slice(0, close);
    // 直下の要素だけを数える（入れ子の中は数えない）
    let depth = 0;
    let top = 0;
    for (const t of inner.matchAll(/<\/?([A-Za-z][\w.]*)\b[^>]*?(\/?)>/g)) {
      const isClose = t[0].startsWith("</");
      const selfClose = t[2] === "/";
      if (isClose) { depth--; continue; }
      if (depth === 0) top++;
      if (!selfClose) depth++;
    }
    if (top >= 2) {
      const line = src.slice(0, m.index).split("\n").length;
      bad.push({ file, line, tag, top });
    }
  }
}

console.log(`asChild の箇所: ${checked} 件（うち直下の要素が2つ以上あるものを見る）`);
if (bad.length === 0) {
  console.log("複数の子を渡している箇所はありません。");
  process.exit(0);
}

console.error(`\n■ asChild なのに直下の要素が2つ以上ある: ${bad.length} 件`);
console.error("  🚨 Radix の Slot は子が1つでないと投げ、**ページごと落ちる**（描画中の例外なので復帰できない）。");
for (const b of bad) console.error(`  ${b.file}:${b.line}  <${b.tag} asChild>  直下の要素 ${b.top} 個`);
console.error(
  "\n  直し方: 子を1つの要素の中へ入れる（例: <Button asChild><a>…複数…</a></Button>）。" +
    "\n  🚨 その際 `{...props}` より**後**に children を書くこと（props に children が含まれるため）。",
);
process.exit(1);
