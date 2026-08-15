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
 * 由来: 堀池「必ずルールを見直して。洗礼させて」／knowledge/decisions/no-nested-surfaces.md §3
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
  // 🚨 `\bborder\b` は **`border-0` にも当たる**（`-` が単語境界なので）。
  // つまり「罫線を明示的に消した」ものを罫線として数えてしまう。**偽の赤**。
  // 由来: 2026-08-14。カラーピッカーに `rounded-lg border-0` と書いたら違反として出た。
  // 憲章 §1「正解を違反と言う検査は使われなくなり、検査そのものが死ぬ」。
  // → 罫線として数えるのは「幅を持つ border」だけ。`-0` / `-none` / `-transparent` は数えない。
  { name: "囲む罫線", re: /\brounded-(?:md|lg|xl|2xl)\b[^"']*\bborder(?!-(?:0|none|transparent)\b)\b|\bborder(?!-(?:0|none|transparent)\b)\b[^"']*\brounded-(?:md|lg|xl|2xl)\b/ },
  { name: "面の背景", re: /\bbg-(?:card|background|accent)\b/ },
  { name: "影", re: /\bshadow-(?:sm|md|lg|xl)\b/ },
];

/**
 * 面として許容するもの（面1つぶんとして数えてよい正当な箱）。
 * 🚨 ここを増やすときは knowledge/decisions/no-nested-surfaces.md にも理由を書くこと。
 */
const ALLOW = [
  // 警告・エラーの箱。色で意味を持つので面1つとして許容（ページ直下に置く前提）
  { file: /error-banner\.tsx$/, why: "エラー表示。色で意味を持つ箱",
    decided: "決定/2026-08-13/design（色で意味を持つ箱は面1つぶんとして数える）" },
  { pattern: /destructive/, why: "警告色の箱（エラー・失効トークン等）",
    decided: "決定/2026-08-13/design（同上）" },
  // メディアの受け皿。画像のレターボックスに背景が要る
  { pattern: /aspect-square|min-h-80|object-contain/, why: "メディアの受け皿",
    decided: "決定/2026-08-13/design（画像のレターボックスに背景が要る）" },
  // モーダルは面が1段重なってよい（surface-rules §4）
  { file: /dialog\.tsx$/, why: "モーダル。面が重なってよい唯一の例外",
    decided: "決定/2026-08-13/design（surface-rules §4。**唯一の例外**と明記されている）" },
  // 素材（shadcn の部品そのもの）
  { file: /components\/ui\/(?!surface)/, why: "UI 部品そのものの見た目",
    decided: "決定/2026-08-13/design（shadcn の素材そのもの。面の判断はページ側で行う）" },
  // 🚨 画面に固定されたバー。position:fixed は out of flow なので、
  // DOM 上どこに書かれていても**面の中には入らない**（親の面の上に重なるのではなく、画面に貼られる）。
  // かつ不透明でないと下の内容が透けるため、背景は必須。ページ本体と同じ bg-background を使う。
  // 由来: 2026-08-13。SP の下部ナビ（components/admin/mobile-nav.tsx）を入れたら、
  // 「components/admin/** は必ず Surface の中」という前提に当たって**正解を違反と報告した**。
  // 憲章 §1「正解を違反と言う検査は使われなくなり、検査そのものが死ぬ」。
  {
    pattern: /\bfixed\b[^"']*\binset-x-0\b|\binset-x-0\b[^"']*\bfixed\b/,
    why: "画面に固定されたバー（out of flow なので面の中に入らない）",
    decided: "決定/2026-08-13/design（SP の下部ナビで**正解を違反と報告した**ため。憲章 §1）",
  },
];

function allowedFor(file, line) {
  for (const rule of ALLOW) {
    if (rule.file && rule.file.test(file)) return rule;
    if (rule.pattern && rule.pattern.test(line)) return rule;
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
    // 🚨 className={cn("...", "...")} を読めるようにする。
    // 以前は /className=\{?["'`]/ で「= の次が引用符」しか見ておらず、
    // cn( が挟まる 50箇所 / 16ファイルが**丸ごとノーチェック**だった（design 番人の指摘・実証済み）。
    // → className= 以降に現れる**すべての文字列リテラルを連結**して判定する。
    if (!line.includes("className")) return;
    const after = line.slice(line.indexOf("className"));
    const literals = [...after.matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]);
    if (literals.length === 0) return;
    const classAttr = [null, literals.join(" ")];
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
      if (why) allowed.push({ ...entry, why: why.why, decided: why.decided });
      else hits.push(entry);
      break;
    }
  });
}

console.log(`対象: 面の中で描かれる ${files.length} 本を走査`);
// 🚨 **内訳を出す。** 件数だけだと、8 行目の例外が足されて違反を飲み込み始めても
//    「許容した面: N 件」が増えるだけで、**緑のまま気づけない**。
//    どの例外が何件効いたかを毎回出せば、増えたものが目に入る。
console.log(`許容した面: ${allowed.length} 件`);
const byRule = new Map();
for (const a of allowed) byRule.set(a.why, (byRule.get(a.why) ?? 0) + 1);
for (const [why, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
  const rule = ALLOW.find((r) => r.why === why);
  console.log(`    ${String(count).padStart(3)} 件  ${why}  [${rule?.decided ?? "🚨 決定の記録が無い"}]`);
}
// 🚨 一度も効かなかった例外も出す。**ただし「死んだ行」ではない。**
//    例外は「違反になりかけたもの」にしか効かないので、**候補が出ていなければ 0 件が健全**。
//    実測（design・2026-08-15）: 候補 133 件の中に components/ui/dialog.tsx も入っており、
//    **対象は見ている**。0 件は「見ていない」ではなく「要る場面がまだ出ていない」。
//    🚨 **消さないこと。** 消すと、次に候補が出たとき**正解が違反として落ちる**（憲章 §1）。
const unused = ALLOW.filter((rule) => !byRule.has(rule.why));
if (unused.length > 0) {
  console.log(`  （下の ${unused.length} 行は 0 件＝**この例外が要る場面がまだ出ていない**。対象は見ている。消さないこと）`);
  for (const rule of unused) {
    console.log(`      0 件  ${rule.why}  [${rule.decided ?? "🚨 決定の記録が無い"}]`);
  }
}
console.log(`🚨 面の中の生の面: ${hits.length} 件`);

if (hits.length > 0) {
  console.error("\n■ 面の中に生の面クラスがあります（knowledge/decisions/no-nested-surfaces.md §2-1）");
  console.error("  Surface が持つ器の中で、さらに罫線・背景・影を持つと面が2段になります。");
  console.error("  区切りたいだけなら <SurfaceDivider> を使ってください。\n");
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  [${h.kind}]`);
    console.error(`      ${h.snippet}`);
  }
  process.exit(1);
}
console.log("違反なし。");
