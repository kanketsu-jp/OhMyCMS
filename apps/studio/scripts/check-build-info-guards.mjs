#!/usr/bin/env node
/**
 * `/api/health` の `dirty` を意味のある旗のまま保つための検査。
 *
 * 🚨 **なぜ検査にするのか。**
 * `.dockerignore` と `docker/Dockerfile` に「**消さないこと**」とコメントで書いていたが、
 * **守っているものが何も無かった**（2026-08-15・規律12「コメントが在ることは、守られていることではない」）。
 * 1 行消えるだけで **dirty が毎回 1 に戻り、しかも誰も気づかない**——
 * **旗が常に立つと、見る人が「立っているのが普通」と学習する**ため。
 * 今朝まで全員がそう思っていた状態へ、1 行で戻せてしまう。
 *
 * 🚨 **この検査自体が空振りしないように**（規律5「対照が効いていても探し方が当たっているとは限らない」）:
 *   - 読めたバイト数を必ず出す。**0 バイト・読めない＝合格ではなく失敗**にする
 *   - 「在るものが在ると出る」対照を**同じ読み方で**毎回実行し、**それが落ちたら検査ごと失敗**にする
 *   - パスは**このファイルの位置から**解決する（cwd に依存しない。cwd 違いで空振りした事例が今日あった）
 *
 * 🚨 **この検査が見ていない範囲**（守り手を書く人は、穴も書く。2026-08-15・schema が追記）:
 *   1. **時点** … 走るのは**コミット時の作業ツリー**。ビルドが使うのは**押された commit**。
 *      `--no-verify` や、フックが動かない経路で押されたら**一度も見ません**。
 *      （CI かビルドの中でも回せば消えるずれ。**まだ回していません**）
 *   2. **中身の正しさ** … 見ているのは「その文字列が実コードに在るか」だけ。
 *      🚨 **条件を反転させても通ります**（例: `if ! git check-ignore …` にする）。
 *      **在る/無いは見るが、意味は見ていません。**
 *   3. **実際の結果** … **ビルドしていません**。綺麗なツリーで本当に `dirty=0` が出るかは
 *      **押した後の `/api/health` でしか分かりません**。
 *   4. **`.dockerignore` の他の行** … 必要な行が在ることは見ますが、
 *      🚨 **後から広いパターン（`*` など）を足して全部除外しても通ります。**
 *
 * 使い方: `node scripts/check-build-info-guards.mjs`（違反があれば exit 1）
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// scripts/ → apps/studio/ → apps/ → リポジトリ root
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** 読めなければ**失敗として投げる**。「読めなかった＝違反が無い」にしない。 */
function read(relative) {
  const path = join(REPO, relative);
  try {
    const text = readFileSync(path, "utf8");
    if (text.length === 0) throw new Error("0 バイト");
    return { path, text, bytes: text.length };
  } catch (error) {
    console.error(`✖ 読めません: ${relative}（${error instanceof Error ? error.message : String(error)}）`);
    console.error("  🚨 これは「違反が無い」ではありません。**検査が対象に届いていない**ので失敗として扱います。");
    process.exit(2);
  }
}

const dockerignore = read(".dockerignore");
const dockerfile = read("docker/Dockerfile");

/**
 * 🚨 **コメントを実コードとして数えない。**
 * 最初の版は本文をそのまま正規表現にかけていたので、
 * **実装を消してコメントに同じ文字列を残すだけで素通り**した（自分で試して確認）。
 *
 * 🚨 **行頭の `#` を落とすだけでは足りなかった。** 2 回目の試しで
 * `true # update-index --skip-worktree` の形（**行の途中から始まるコメント**）が**素通り**した。
 * → **各行を最初の `#` で切る**。
 *   このファイルの対象行（`update-index` / `git status --porcelain` / `FROM base AS gitinfo` /
 *   `DETECTED_DIRTY` / `dirty の出どころ`）に `#` は含まれないので、切っても消えない
 *   （**含まれていたら対照が落ちて検査ごと失敗する**ので、黙って通ることはない）。
 */
const 実コード = dockerfile.text
  .split("\n")
  .map((line) => line.split("#")[0])
  .join("\n");

const 行 = dockerignore.text.split("\n").map((l) => l.trim());

// 🚨 **出どころは人に書かせず、計器に言わせる**（貼り付ける人が毎回書く形は、忙しいときに落ちる）
const head = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "(git が引けない)";
  }
})();
console.log(`採取: HEAD ${head} / ${new Date().toISOString()}`);

console.log(
  `対象: .dockerignore ${dockerignore.bytes} バイト（コメントでない行 ${行.filter((l) => l && !l.startsWith("#")).length}）`
  + ` / docker/Dockerfile ${dockerfile.bytes} バイト（コメントでない行 ${実コード.split("\n").filter((l) => l.trim()).length}）`,
);

const checks = [
  {
    名前: "compose.dokploy.yml をビルド文脈から外している",
    由来: "実測（2026-08-15 に本番で dirty=1 が飽和していた原因そのもの）",
    // 🚨 行が在るだけでは足りない。`!compose.dokploy.yml` で**打ち消せる**ので、
    //    打ち消しが無いことまで見る（.dockerignore は後勝ちの否定パターンを持つ）。
    ある: 行.includes("compose.dokploy.yml") && !行.some((l) => l === "!compose.dokploy.yml"),
    // 🚨 **原因を名指しする。** 「行が無い」と「打ち消されている」を同じ文言にすると、
    //    読んだ人が**在る行を探しに行く**（今日の「捕まえたことと、正しく名指しできることは別」）。
    原因: () => (行.includes("compose.dokploy.yml")
      ? "行は在りますが `!compose.dokploy.yml` で打ち消されています"
      : "行そのものがありません"),
    // 「在るものが在ると出る」対照。これが false なら**探し方が壊れている**
    対照: 行.includes("compose.yml"),
    対照の説明: "compose.yml の行（同じ探し方で必ず見つかるもの）",
    壊れると: "Dokploy が clone 先で書き換える compose が文脈に入り、dirty が毎回 1 に戻る",
  },
  {
    名前: "gitinfo が skip-worktree で「文脈から外れた追跡ファイル」を吸収している",
    由来: "実測（消すと綺麗なツリーでも 19 本が \" D\" で復活することを docker build で確認）",
    ある: /update-index\s+--skip-worktree/.test(実コード),
    対照: /FROM base AS gitinfo/.test(実コード),
    対照の説明: "gitinfo ステージの宣言（同じ読み方で必ず見つかるもの）",
    壊れると: "綺麗なツリーでも 19 本が \" D\" で残り、dirty が常に 1 になる",
  },
  {
    名前: "gitinfo が「除外されたから無い」と「本当に消された」を区別している",
    由来: "実測（追跡ファイルを消しても dirty=0 だった穴。docker build で RED→GREEN 済み）",
    // 🚨 skip-worktree を **無条件に**掛けると、**本当に消された追跡ファイルまで吸収**して
    //    dirty が 0 のままになる（2026-08-15 実測。docker build で再現済み）。
    //    `git check-ignore --no-index` で .dockerignore に当たるものだけを吸収する。
    ある: /check-ignore\s+--no-index/.test(実コード),
    対照: /update-index\s+--skip-worktree/.test(実コード),
    対照の説明: "skip-worktree の呼び出し（この検査が Dockerfile を読めている証拠）",
    壊れると: "追跡ファイルを消しても dirty が 0 のままになる（本当に汚れた像を見逃す）",
  },
  {
    名前: ".dockerignore を文脈に残している（区別の材料）",
    由来: "先回り（この行を外すと上の区別ができなくなる。**実測で出た形ではない**）",
    // 自分自身を外すと、ビルドの中で「なぜ無いのか」を判定する材料が消える
    ある: !行.some((l) => l === ".dockerignore"),
    対照: 行.includes("compose.yml"),
    対照の説明: "compose.yml の行（同じ読み方で必ず見つかるもの）",
    壊れると: "check-ignore が判定できず、消された追跡ファイルを吸収してしまう",
  },
  {
    名前: "gitinfo が git status で dirty を判定している",
    由来: "先回り（判定そのものが消える形。**実測で出た形ではない**）",
    ある: /git status --porcelain/.test(実コード),
    対照: /DETECTED_DIRTY/.test(実コード),
    対照の説明: "DETECTED_DIRTY の宣言",
    壊れると: "判定そのものが消え、外から渡された値がそのまま出る（ツリーについて何も言わない値になる）",
  },
  {
    名前: "dirty=1 のとき、内訳と出どころをビルドログへ出している",
    由来: "先回り（原因が追えなくなる形。**実測で出た形ではない**）",
    ある: /dirty の出どころ/.test(実コード),
    対照: /gitinfo:/.test(実コード),
    対照の説明: "gitinfo のログ出力",
    壊れると: "旗が立った理由が誰にも分からなくなる（今朝の状態へ戻る）",
  },
];

let 違反 = 0;
let 対照の失敗 = 0;

for (const c of checks) {
  if (!c.対照) {
    console.error(`✖ 対照が落ちました: ${c.対照の説明}`);
    console.error("  🚨 **本命の判定は使えません**（探し方が当たっていない可能性）。検査ごと失敗にします。");
    対照の失敗 += 1;
    continue;
  }
  if (c.ある) {
    console.log(`  ✅ ${c.名前}`);
  } else {
    console.error(`  ✖ ${c.名前}`);
    if (c.原因) console.error(`     何が起きているか: ${c.原因()}`);
    console.error(`     壊れると: ${c.壊れると}`);
    console.error(`     この検査の由来: ${c.由来}`);
    違反 += 1;
  }
}

console.log(`判定: 検査 ${checks.length} 件 / 違反 ${違反} 件 / 対照の失敗 ${対照の失敗} 件`);

if (対照の失敗 > 0) process.exit(2);
if (違反 > 0) {
  console.error("🚨 dirty の旗が意味を失う変更です。直すか、直せない理由をコミットメッセージに書いてください。");
  process.exit(1);
}
