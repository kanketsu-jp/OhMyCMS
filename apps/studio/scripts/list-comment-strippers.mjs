#!/usr/bin/env node
/**
 * 「コメントを落とす仕組み」を、検査ごとに**その場で数える**（門ではない。人が叩く道具）。
 *
 * ■ なぜ道具にしたか（2026-08-16）
 *   この数を私（polish）が 3 回配り、**3 回とも違っていた**:
 *     ① 「import している 9 本のうち 4 本が壊れている」
 *        → 🚨 **母集合の外**（自前で持っている人）が見えない形だった（saml の指摘）
 *     ② 「自前 8 本」→ その後みんなが共有へ寄せたので、**配った直後から古い**
 *     ③ 「両方持っている 3 本」→ 🚨 **design が書いたコメント**を import として数えていた（実際は 0 本）
 *   ＝ **数は配った瞬間から腐る。そして手で数えると、コメントを数える。**
 *   → **各自がその場で叩けるようにする。** 出力には必ず HEAD を添える。
 *
 * ■ 🚨 名前で見つからないものを、**形でも探す**（design の提案・2026-08-16）
 *   `isComment` / `commentMask` / `stripComments` という名前でなくても、
 *   `startsWith("//")` のような**コメント判定の形**を持つ検査は在りうる。
 *   → 名前で分類したあと、**形でもう一度走査**し、名前で拾えなかったものを出す。
 *   🚨 **0 件のときも「形でも探した」と出す**（**見ていない 0 と、異常が無い 0 を分ける**）。
 *   🟢 対照として、**既知の 1 本に形の判定が当たること**を毎回確かめる。
 *
 * ■ 🚨 この道具が見ていない範囲
 *   ・**中身が正しいかは見ていない**（名前と呼び出しの数だけ）。壊れているかは各担当が 2 行で測ること:
 *       🔴 `const u = "https://example.com"; if (x === FOO) {}` → **FOO が残るか**（消えたら見逃し）
 *       🔴 `const x = 1; // FOO` → **FOO を拾わないか**（拾ったら過検出）
 *       🟢 対照 `const y = FOO;` → 残る ／ 🟢 対照 `// FOO` → 消える
 *       （対照 2 つが要る理由: 「全部残る」でも「全部消える」でも見分けが付かない・design）
 *   ・**別名で受けたものは名前で追う**（`import { stripComments as withoutComments }` は拾うが、
 *     まったく別の名前で自前実装を書かれたら見えない）
 *   ・コメントを外してから数えるので、**コメント内の言及は数えない**（③ の再発防止）
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./strip-comments.mjs";
import { trackedGlob, readTracked } from "./lib/tracked-files.mjs";

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(SCRIPTS, "..", "..", "..");

// 🚨 出どころは人に書かせず、計器に出させる（共有ツリーは数分で動く）
const head = execFileSync("git", ["-C", REPO_ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();

// ── 🟢 自己検査（固定の見本。リポジトリの状態を土台にしない） ────────────────
{
  const sample = 'import { stripComments } from "./strip-comments.mjs";\n// ここは strip-comments の話\nstripComments(x);\n';
  const stripped = stripComments(sample);
  const imports = (stripped.match(/^import[^\n]*strip-comments/gm) ?? []).length;
  const mentions = (sample.match(/strip-comments/g) ?? []).length;
  const ok = imports === 1 && mentions === 2;
  console.log(`🟢 対照（見本）: コメントの言及を import として数えない ${ok ? "✅" : "🚨 ❌"}（素で ${mentions} 件 / 実際 ${imports} 件）`);
  if (!ok) {
    console.error("🚨 この道具が動いていません。下の数は信用できません");
    process.exit(1);
  }
}

// 🚨 走査範囲は `scripts` の **`.mjs` と `.ts` 全部**（2026-08-16・schema と auth の指摘で直した）。
//    最初は `check-*.mjs` だけ（34 本）で、**`.ts` の検査**（`check-field-labels.ts`）と
//    **`check-` で始まらない道具**が丸ごと視界の外だった。
//    ＝ 🚨 **「出ない」を「持っていない」と読める形**だった。**母集合を広げ、内訳で出す。**
const files = [
  ...trackedGlob("scripts/*.mjs", { cwd: resolve(SCRIPTS, "..") }),
  ...trackedGlob("scripts/*.ts", { cwd: resolve(SCRIPTS, "..") }),
].sort();
if (files.length === 0) {
  console.error("🚨 走査対象が 0 本でした。**この 0 は「見ていない 0」です**");
  process.exit(1);
}

const rows = [];
for (const rel of files) {
  const src = stripComments(readTracked(resolve(SCRIPTS, "..", rel)) ?? "");
  const importLine = src.match(/^import[^\n]*strip-comments[^\n]*$/m);
  const alias = importLine?.[0].match(/stripComments\s+as\s+([A-Za-z_$][\w$]*)/)?.[1] ?? null;
  const localDef = /^\s*(?:function|const)\s+stripComments\b/m.test(src);
  const calls = (src.match(new RegExp(`\\b(?:${alias ?? "stripComments"})\\(`, "g")) ?? []).length;
  const own = (src.match(/\b(isComment|commentMask)\b/g) ?? []).length;
  if (!importLine && !localDef && own === 0) continue;
  rows.push({
    name: rel.replace("scripts/", "").replace(".mjs", ""),
    kind: importLine ? (alias ? `共有（別名 ${alias}）` : "共有") : localDef ? "🚨 同名の別実装" : "🚨 自前（別の名前）",
    calls,
    own,
  });
}

console.log(`\nコメントを落とす仕組みを持つ検査: ${rows.length} 本（HEAD ${head} ／ 走査 ${files.length} 本）`);
console.log(`${"検査".padEnd(32)}${"種類".padEnd(22)}${"呼出".padStart(5)}${"自前語".padStart(7)}`);
for (const r of rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))) {
  console.log(`${r.name.padEnd(32)}${r.kind.padEnd(22)}${String(r.calls).padStart(5)}${String(r.own).padStart(7)}`);
}
// ── 🚨 形でも探す（名前で拾えなかったものを出す） ────────────────────────
{
  const SHAPE = /startsWith\(\s*["']\/\/|startsWith\(\s*["']\*|\\\/\\\/\.\*|\/\\\*\[\\s\\S\]/;
  const named = new Set(rows.map((r) => "scripts/" + r.name + ".mjs"));
  const extra = [];
  let controlHit = false;
  for (const rel of files) {
    const src = stripComments(readTracked(resolve(SCRIPTS, "..", rel)) ?? "");
    if (!SHAPE.test(src)) continue;
    if (named.has(rel)) { controlHit = true; continue; }
    extra.push(rel.replace("scripts/", "").replace(".mjs", ""));
  }
  // 🚨 名前で拾えた検査に 1 本も当たらないなら、**形の判定が死んでいる**（0 件は信用できない）
  if (!controlHit) {
    console.error("\n🚨 形の判定が、名前で拾えた検査に 1 本も当たりません。**下の 0 件は「見ていない 0」です**");
    process.exit(1);
  }
  console.log(
    extra.length === 0
      ? "\n🟢 形でも探した（startsWith(\"//\") 等）… 名前で拾えなかったもの **0 本**（＝ 異常が無い 0。上の対照で計器は動いています）"
      : "\n🚨 形でだけ見つかった検査: " + extra.length + " 本 → " + extra.join(" / ") + "（**名前が違うので分類から漏れていました**）",
  );
}

// 🚨 **4 つ目の区分**（base2 の指摘・2026-08-16）: **そもそもコメントを落としていない**検査。
//    これを出さないと、**一覧に出ない＝見ていない**のか**仕組みを持っていない**のかが区別できない
//    （実際に auth と schema が「私の検査が出ません」と報せてきた）。
const none = files.length - rows.length;
console.log(
  `\n走査 ${files.length} 本 ＝ 仕組みを持つ ${rows.length} 本 ＋ 🚨 **持たない ${none} 本**` +
    `（＝ コメントを落としていない。**一覧に出ないのは「見ていない」ではなく「持っていない」**）`,
);

const shared = rows.filter((r) => r.kind.startsWith("共有")).length;
console.log(
  `\n共有を使う ${shared} 本 ／ 🚨 それ以外 ${rows.length - shared} 本` +
    `\n🚨 **共有を直しても、それ以外には 1 文字も届きません。** 中身が壊れているかは、冒頭の 2 行で各担当が測ること。`,
);
