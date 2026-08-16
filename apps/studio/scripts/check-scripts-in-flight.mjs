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

// 🚨 **見る範囲**（2026-08-16・shell の指摘で広げた）。**狭く切って 1 回外している**:
//    最初は `apps/studio/scripts` と `.lefthook` だけで、**`scripts/gate.sh`（門を呼ぶ側）と
//    `lefthook.yml`（門の定義）が外**だった。実測: どちらを汚しても出力 0 件・git 側は 2 行。
//    ＝ 🚨 **`gate.sh` が 17 時間ぶん索引と違っていても、この道具は何も言わなかった**。
//    shell の一文: 「**`gate.sh` は検査の対象ではなく、検査を呼ぶ側**なので網の外だった」。
const WATCHED = ["apps/studio/scripts", "scripts", ".lefthook", "lefthook.yml"];
const status = execFileSync("git", ["-C", REPO_ROOT, "status", "--porcelain", "-z", "--", ...WATCHED], {
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
  // 🚨 `lefthook.yml`（門の定義）も見る。**拡張子で切ると、これが落ちる**
  if (!/\.(mjs|cjs|ts|sh|yml)$/.test(path)) continue;
  // 🚨 **staged 済みは窓ではない**（2026-08-16 実測: 自分が `git add` した新規検査を
  //    「編集中」と出してしまった）。危ないのは **作業ツリーが索引と違う**もの＝**書きかけ**。
  //    `git status --porcelain` の 2 文字目が作業ツリー側（` ` なら索引と同じ）。
  //    未追跡（`??`）は、まだ何も決まっていないので窓として数える。
  const inFlight = mark === "??" || mark[1] !== " ";
  if (!inFlight) continue;
  dirty.push({ mark, path });
}

/**
 * 経過時間を、**読める単位**で出す。
 *
 * 🚨 由来（2026-08-16・shell の指摘）: 最初は **秒 / 分だけ**だったので、
 *   **17.5 時間が「1050 分前」**と出た。＝ **「8 時間前」と「たった今」が同じ顔をする**。
 *   実際 `scripts/gate.sh` は 17.5 時間 索引と違っていた（**その間この道具の母集合の外**だったので
 *   1 行も出していないが、**次に同じことが起きたときに気づける形にする**）。
 * 🚨 **24 時間を超えたら「置き忘れかもしれません」を添える**（**数字だけでは読み飛ばされる**）。
 */
function 経過(ms) {
  const 秒 = ms / 1000;
  if (秒 < 60) return `${Math.round(秒)} 秒前`;
  const 分 = 秒 / 60;
  if (分 < 60) return `${Math.round(分)} 分前`;
  const 時間 = 分 / 60;
  if (時間 < 24) return `**${Math.round(時間)} 時間前**`;
  return `🚨 **${Math.round(時間 / 24)} 日前**（**置き忘れかもしれません**）`;
}

if (dirty.length === 0) {
  // 🚨 何も出さない（緑のときに毎回 1 行出すと、読まれなくなる）
  process.exit(0);
}

console.log(
  "🚨 いま**門まわりが編集中**です（この検査は落としません。心当たりとして出しています）:" +
    `\n   （見ている範囲: ${WATCHED.join(" / ")} の **.mjs .cjs .ts .sh .yml**。**それ以外は見ていません**）`,
);
for (const d of dirty) {
  let age = "";
  try {
    const ms = Date.now() - statSync(resolve(REPO_ROOT, d.path)).mtimeMs;
    age = `／最後に書かれたのは ${経過(ms)}`;
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
