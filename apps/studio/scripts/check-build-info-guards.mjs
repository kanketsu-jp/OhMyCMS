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
 * 使い方: `node scripts/check-build-info-guards.mjs`（違反があれば exit 1）
 */

import { readFileSync } from "node:fs";
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

console.log(`対象: .dockerignore ${dockerignore.bytes} バイト / docker/Dockerfile ${dockerfile.bytes} バイト`);

const checks = [
  {
    名前: "compose.dokploy.yml をビルド文脈から外している",
    ある: dockerignore.text.split("\n").some((line) => line.trim() === "compose.dokploy.yml"),
    // 「在るものが在ると出る」対照。これが false なら**探し方が壊れている**
    対照: dockerignore.text.split("\n").some((line) => line.trim() === "compose.yml"),
    対照の説明: "compose.yml の行（同じ探し方で必ず見つかるもの）",
    壊れると: "Dokploy が clone 先で書き換える compose が文脈に入り、dirty が毎回 1 に戻る",
  },
  {
    名前: "gitinfo が skip-worktree で「文脈から外れた追跡ファイル」を吸収している",
    ある: /update-index\s+--skip-worktree/.test(dockerfile.text),
    対照: /FROM base AS gitinfo/.test(dockerfile.text),
    対照の説明: "gitinfo ステージの宣言（同じ読み方で必ず見つかるもの）",
    壊れると: "綺麗なツリーでも 19 本が \" D\" で残り、dirty が常に 1 になる",
  },
  {
    名前: "gitinfo が git status で dirty を判定している",
    ある: /git status --porcelain/.test(dockerfile.text),
    対照: /DETECTED_DIRTY/.test(dockerfile.text),
    対照の説明: "DETECTED_DIRTY の宣言",
    壊れると: "判定そのものが消え、外から渡された値がそのまま出る（ツリーについて何も言わない値になる）",
  },
  {
    名前: "dirty=1 のとき、内訳と出どころをビルドログへ出している",
    ある: /dirty の出どころ/.test(dockerfile.text),
    対照: /gitinfo:/.test(dockerfile.text),
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
    console.error(`     壊れると: ${c.壊れると}`);
    違反 += 1;
  }
}

console.log(`判定: 検査 ${checks.length} 件 / 違反 ${違反} 件 / 対照の失敗 ${対照の失敗} 件`);

if (対照の失敗 > 0) process.exit(2);
if (違反 > 0) {
  console.error("🚨 dirty の旗が意味を失う変更です。直すか、直せない理由をコミットメッセージに書いてください。");
  process.exit(1);
}
