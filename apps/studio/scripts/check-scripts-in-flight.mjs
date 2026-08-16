#!/usr/bin/env node
/**
 * 🚨 **門が赤いとき、「その検査がいま編集中か」を、聞かれる前に出す。**
 *
 * ■ 由来（2026-08-16・司令塔の指示「忘れても効くように」）
 *   今日みんなで塞いだのは「**検査が読むデータ**」だった（索引から読む）。
 *   🚨 塞げていないのは、**検査スクリプトそのもの**——**作業ツリーの版が `node` で実行される**ので、
 *   **他ペインが検査を編集している最中は、全員のコミットが止まる**。
 *   実測（polish が 5 分で 2 回）:
 *     `check-i18n-hardcoded.mjs` が **SyntaxError**（`git status` は ` M`／索引版は通る）
 *     `check-nav-parity.mjs` が exit=1（同じく編集中）
 *   どちらも数分で緑に戻った。＝ **待てばよかったが、落ちた側にはそれが分からない。**
 *   申告: shell **16 回** / auth **22 回**、今日この窓を開けていた（本人たちの実測）。
 *
 * ■ この検査の立場: 🚨 **落とさない**（`exit 0` で終わる）
 *   編集中を赤にすると、**検査を書くこと自体が門に阻まれる**（＝ 誰も検査を直せなくなる）。
 *   ここがやるのは **「いま窓が開いています」と出すことだけ**。判断は読んだ人がする。
 *
 * ■ 🚨 見ていない範囲
 *   ・**誰が編集しているかは分からない**（git は作業ツリーの編集者を持たない）。
 *     名乗りは人がする（司令塔の決めごと: 検査を触る前に 1 行出す）。
 *   ・**いつから編集中かも分からない**（`git` に「編集を始めた時刻」は無い）。
 *     参考として**ファイルの更新時刻**だけ出す。
 *   ・**編集中でなくても落ちることは在る**（本物の違反）。これは「原因」ではなく「心当たり」。
 */
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(SCRIPTS, "..", "..", "..");

const status = execFileSync("git", ["-C", REPO_ROOT, "status", "--porcelain", "-z", "--", "apps/studio/scripts", ".lefthook"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

// `-z` は NUL 区切り。rename は `R  new\0old\0` の 2 つ組になるので、印を見て読み進める。
const dirty = [];
const parts = status.split("\0").filter((x) => x !== "");
for (let i = 0; i < parts.length; i += 1) {
  const entry = parts[i];
  const mark = entry.slice(0, 2);
  const path = entry.slice(3);
  if (mark.startsWith("R")) i += 1; // rename の元パスを読み飛ばす
  if (!/\.(mjs|cjs|ts|sh)$/.test(path)) continue;
  dirty.push({ mark, path });
}

if (dirty.length === 0) {
  // 🚨 何も出さない（緑のときに毎回 1 行出すと、読まれなくなる）
  process.exit(0);
}

console.log("🚨 いま**検査スクリプトが編集中**です（この検査は落としません。心当たりとして出しています）:");
for (const d of dirty) {
  let age = "";
  try {
    const ms = Date.now() - statSync(resolve(REPO_ROOT, d.path)).mtimeMs;
    age = `／最後に書かれたのは ${ms < 60_000 ? `${Math.round(ms / 1000)} 秒前` : `${Math.round(ms / 60_000)} 分前`}`;
  } catch {
    age = "／更新時刻が読めません";
  }
  console.log(`   ${d.mark} ${d.path}${age}`);
}
console.log(
  "\n   🚨 **門が赤いなら、まずこの一覧を疑ってください**（**あなたの変更が原因ではないかもしれません**）。" +
    "\n   🚨 **ただし「編集中＝原因」ではありません**（本物の違反でも赤くなります）。" +
    "\n   触っている方へ: **終わったら 1 行ください**（待っている人が居ます）。",
);
process.exit(0);
