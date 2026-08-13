#!/usr/bin/env node
/**
 * 面（Surface）の入れ子を**静的に**検出する。
 *
 * 🚨 なぜ要るか:
 * `components/ui/surface.tsx` の Context による自動降格は **`<Surface>` の入れ子しか捕まえない**。
 * `className="rounded-md border p-4"` のような **生のクラスは素通りする**（design 番人の指摘 ③）。
 * 実際、Card を Surface へ置き換えただけでは深さ3が消えなかった。
 *
 * ルールを文書に書くだけでは同じことが起きるので、**落とせる検査**にする。
 * 由来: 堀池「必ずルールを見直して。洗礼させて」／docs/design/surface-rules.md §3
 *
 *   node scripts/check-surface-nesting.mjs
 */

import { readFileSync, globSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** 面を作るクラスの組み合わせ（囲む罫線 / 面としての背景 / 影）。 */
const SURFACE_PATTERNS = [
  { name: "囲む罫線", re: /\brounded-(?:md|lg|xl|2xl)\b[^"']*\bborder\b|\bborder\b[^"']*\brounded-(?:md|lg|xl|2xl)\b/ },
  { name: "面の背景", re: /\bbg-(?:card|background|accent)\b/ },
  { name: "影", re: /\bshadow-(?:sm|md|lg|xl)\b/ },
];

/**
 * 面として許容するもの（面1つぶんとして数えてよい正当な箱）。
 * 🚨 ここを増やすときは docs/design/surface-rules.md にも理由を書くこと。
 */
const ALLOW = [
  // 警告・エラーの箱。色で意味を持つので面1つとして許容（ページ直下に置く前提）
  { file: /error-banner\.tsx$/, why: "エラー表示。色で意味を持つ箱" },
  { pattern: /destructive/, why: "警告色の箱（エラー・失効トークン等）" },
  // メディアの受け皿。画像のレターボックスに背景が要る
  { pattern: /aspect-square|min-h-80|object-contain/, why: "メディアの受け皿" },
  // モーダルは面が1段重なってよい（surface-rules §4）
  { file: /dialog\.tsx$/, why: "モーダル。面が重なってよい唯一の例外" },
  // 素材（shadcn の部品そのもの）
  { file: /components\/ui\/(?!surface)/, why: "UI 部品そのものの見た目" },
];

function allowedFor(file, line) {
  for (const rule of ALLOW) {
    if (rule.file && rule.file.test(file)) return rule.why;
    if (rule.pattern && rule.pattern.test(line)) return rule.why;
  }
  return null;
}

/** そのファイルは「面の中で描かれる」か。 */
function rendersInsideSurface(file, source) {
  // components/admin/** は必ずページの <Surface> の中に置かれる
  if (/components\/admin\//.test(file)) return true;
  // ページ側は <Surface> を使っていればその中
  return source.includes("<Surface");
}

const files = globSync("{app,components}/**/*.tsx", { cwd: root }).sort();
const hits = [];
const allowed = [];

for (const file of files) {
  const source = readFileSync(resolve(root, file), "utf8");
  if (!rendersInsideSurface(file, source)) continue;

  source.split("\n").forEach((line, i) => {
    const classAttr = /className=\{?["'`]([^"'`]+)/.exec(line);
    if (!classAttr) return;
    // 🚨 状態つきのクラス（focus-visible: / hover: / dark: / aria-invalid: など）は面ではない。
    // フォーカスリングやホバーの色を「罫線」「背景」と数えると誤検出になる（実測で判明）。
    const cls = classAttr[1]
      .split(/\s+/)
      .filter((token) => !token.includes(":"))
      .join(" ");
    for (const { name, re } of SURFACE_PATTERNS) {
      if (!re.test(cls)) continue;
      const why = allowedFor(file, line);
      const entry = { file, line: i + 1, kind: name, snippet: cls.slice(0, 70) };
      if (why) allowed.push({ ...entry, why });
      else hits.push(entry);
      break;
    }
  });
}

console.log(`対象: 面の中で描かれる ${files.length} 本を走査`);
console.log(`許容した面: ${allowed.length} 件（エラー箱・メディア・モーダル・UI部品）`);
console.log(`🚨 面の中の生の面: ${hits.length} 件`);

if (hits.length > 0) {
  console.error("\n■ 面の中に生の面クラスがあります（docs/design/surface-rules.md §2-1）");
  console.error("  Surface が持つ器の中で、さらに罫線・背景・影を持つと面が2段になります。");
  console.error("  区切りたいだけなら <SurfaceDivider> を使ってください。\n");
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  [${h.kind}]`);
    console.error(`      ${h.snippet}`);
  }
  process.exit(1);
}
console.log("違反なし。");
