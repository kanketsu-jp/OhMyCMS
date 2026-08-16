#!/usr/bin/env node
/**
 * docs/ の索引（docs/index.md）と実体の取りこぼしを機械的に検出する。
 *
 * 由来（2026-08-16 実測・司令塔判断=案A）: docs/ は18本あるが索引が無く、
 * 「書いた本人しか場所を知らない文書」が docs/ の外から一度も参照されないまま
 * 18本中9本残っていた（本検査を作った日に書いた
 * docs/research/ci-docker-migrate-failure-2026-08-16.md 自身もその1本だった）。
 * knowledge/ には knowledge/index.md と鮮度検査（rokf doctor）があるのに、
 * docs/ には同じ仕組みが無かった。この検査は docs/index.md を同じ役目にする。
 *
 * 見ているもの（両方向）:
 *   - docs 配下の *.md（再帰的）に実体があるのに docs/index.md にリンクが無い（追加忘れ）
 *   - docs/index.md にリンクがあるのに docs 配下に実体が無い（削除忘れ・タイプミス）
 *   - docs/ に 1 本も見つからない（走査そのものが壊れている可能性。空の期待は「全部ある」ではない）
 *
 * 走査は docs 配下の *.md を再帰的に見る（docs/index.md 自身は対象外）。リンクは docs/index.md 本文の
 * Markdown リンク `](./xxx.md)` 形式を、docs/ 相対パスとして読む。
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..", "..");
const DOCS_DIR = "docs";
const INDEX_FILE = "docs/index.md";

/**
 * docs/ 配下の *.md を相対パス（docs/ 基準・index.md は除く）で列挙する。
 *
 * 🚨 **索引（`git ls-files`）から読む。作業ツリーを直読みしない。**
 *    由来（2026-08-16）: 最初はディスクを `readdirSync` で歩いていた。
 *    **20 ペインが 1 つの作業ツリーを共有している**ので、それだと
 *    **他ペインの書きかけ（未追跡の docs）が、触っていない人の門を赤くする**。
 *    実測: `docs/design/zz-other-pane.md` を 1 本置くだけで「欠け 1」になった。
 *
 * 🚨 **そして、この検査は「照合型」なので片側だけ索引に移してはいけない**
 *    （`knowledge/decisions/checks-read-the-index-not-the-worktree.md`）。
 *    片側だけ移すと**赤の向きが裏返るだけ**なので、
 *    **索引（docs の一覧）と 宣言（index.md の本文）を、両方とも索引から読む**。
 *    ＝ **まだ `git add` していない docs は対象外**（本人が add した瞬間に落ちる）。
 */
function listDocsFiles() {
  return trackedGlob("**/*.md", { cwd: path.join(root, DOCS_DIR) })
    .filter((rel) => rel !== "index.md")
    .sort();
}

/** docs/index.md 本文から `](./xxx.md)` 形式のリンクを、docs/ 相対パスとして抽出する。 */
function extractIndexLinks(indexSource) {
  const links = [];
  const re = /\]\(\.\/([^)]+\.md)\)/g;
  let m;
  while ((m = re.exec(indexSource)) !== null) {
    links.push(m[1]);
  }
  return links;
}

/**
 * 判定本体。ディスクを読まず「docs 実体のパス配列」と「索引リンクのパス配列」を
 * 受け取る純関数にする（自己検査で、実物の写しをメモリ上で壊して確かめられるようにするため）。
 *
 * 返り値の violations は `{ rule, detail }` の配列。rule のラベル一覧:
 *   - "empty-docs"      : docs 実体が 0 本（走査そのものが壊れている可能性）
 *   - "missing-in-index": docs に実体があるのに索引に無い
 *   - "missing-on-disk" : 索引にあるのに docs に実体が無い
 */
function judgeDocsIndex(docsFiles, indexLinks) {
  const violations = [];

  if (docsFiles.length === 0) {
    violations.push({
      rule: "empty-docs",
      detail: "docs/ に *.md が 1 本も見つからない（走査が壊れている可能性。0 本を『全部ある』と読まない）",
    });
    return { violations, docsCount: 0, indexCount: indexLinks.length, missingInIndex: [], missingOnDisk: [] };
  }

  const docsSet = new Set(docsFiles);
  const indexSet = new Set(indexLinks);

  const missingInIndex = docsFiles.filter((f) => !indexSet.has(f)).sort();
  const missingOnDisk = indexLinks.filter((f) => !docsSet.has(f)).sort();

  for (const f of missingInIndex) {
    violations.push({ rule: "missing-in-index", detail: `docs/${f} が docs/index.md に無い（足し忘れ）` });
  }
  for (const f of missingOnDisk) {
    violations.push({ rule: "missing-on-disk", detail: `docs/index.md にある docs/${f} が実体として無い（消し忘れ・タイプミス）` });
  }

  return { violations, docsCount: docsFiles.length, indexCount: indexLinks.length, missingInIndex, missingOnDisk };
}

function loadReal() {
  const docsFiles = listDocsFiles();
  // 🚨 宣言（index.md 本文）も**索引から**読む。実体（上の一覧）と同じ側でないと、
  //    赤の向きが裏返る（decisions/checks-read-the-index-not-the-worktree）。
  //    🚨 index.md 自体がまだ追跡されていない場合（＝ 初回）は null が返るので、
  //    そのときだけディスクを読む（**読んだ側を出力に出す**。黙って切り替えない）。
  const trackedIndex = readTracked(path.join(root, INDEX_FILE));
  let indexFrom = "索引";
  let indexSource = trackedIndex;
  if (trackedIndex === null) {
    // 🚨 **索引そのものが無い場合**（onboard の指摘・2026-08-16）。
    //    手元には在るが未追跡＝**新しい clone や CI には存在しない**。
    //    「載っていない docs が 0 件」ではなく「**照合する相手が居ない**」なので、
    //    黙って緑にせず、**診断を出して打ち切る**（道具そのものが無い形。
    //    「0 job で緑」と同じ系統）。
    if (!existsSync(path.join(root, INDEX_FILE))) {
      console.error("■ 索引の診断");
      console.error(`  ${INDEX_FILE} が在りません。**照合する相手が居ない**ので、この検査は何も見ていません。`);
      console.error("  （docs/ の索引を作ってから、git add してください）");
      process.exit(1);
    }
    indexFrom = "🚨 作業ツリー（index.md がまだ追跡されていません。新しい clone や CI には無い状態です）";
    indexSource = readFileSync(path.join(root, INDEX_FILE), "utf8");
  }
  const indexLinks = extractIndexLinks(indexSource);
  return { docsFiles, indexLinks, indexFrom };
}

function main() {
  const { docsFiles, indexLinks, indexFrom } = loadReal();

  // 🚨 **どちら側から読んだか**を必ず出す（黙って切り替えると、赤の向きが変わった理由が分からない）。
  console.log(`読み込み: docs ${docsFiles.length} 本（索引）/ 索引 ${indexLinks.length} 行（${indexFrom}）`);

  // ── 自己検査: わざと壊して、赤くなることを確かめる ────────────────────────
  // 壊し方は3通り（片方向だけだと「たまたま落ちた」が混ざるので、両方向 + 空を試す）。
  const selfTests = [
    {
      name: "壊し方1: docs 実体だけに 1 本足す（索引に無い＝ missing-in-index）",
      expectRule: "missing-in-index",
      apply: () => ({
        docsFiles: [...docsFiles, "zz-self-test-missing-in-index.md"],
        indexLinks,
      }),
    },
    {
      name: "壊し方2: 索引だけに 1 行足す（実体が無い＝ missing-on-disk）",
      expectRule: "missing-on-disk",
      apply: () => ({
        docsFiles,
        indexLinks: [...indexLinks, "zz-self-test-missing-on-disk.md"],
      }),
    },
    {
      name: "壊し方3: docs を 0 本にする（走査が壊れている場合の検出）",
      expectRule: "empty-docs",
      apply: () => ({
        docsFiles: [],
        indexLinks,
      }),
    },
  ];

  console.log("\n■ 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）");
  let selfTestFailed = false;
  for (const test of selfTests) {
    const { docsFiles: d, indexLinks: i } = test.apply();
    const { violations } = judgeDocsIndex(d, i);
    const matched = violations.filter((v) => v.rule === test.expectRule);
    const detected = matched.length > 0;
    const detectedRules = [...new Set(violations.map((v) => v.rule))].join(",") || "-";
    console.log(
      `  ${detected ? "✅" : "❌"} ${test.name} → 検出 ${violations.length} 件（rule: ${detectedRules}、期待 rule "${test.expectRule}" ${matched.length} 件一致）`,
    );
    if (!detected) selfTestFailed = true;
  }

  // ── 対照検査: 壊していない実物で誤検出しないことを確かめる ────────────────
  console.log("\n■ 対照検査（壊していない実物で誤検出しないことを確かめる）");
  const control = judgeDocsIndex(docsFiles, indexLinks);
  const controlClean = control.violations.length === 0;
  console.log(`  ${controlClean ? "✅" : "❌"} 対照: 実物（docs ${docsFiles.length} 本 / 索引 ${indexLinks.length} 行）→ 検出 ${control.violations.length} 件`);
  if (!controlClean) {
    for (const v of control.violations) {
      console.error(`     [${v.rule}] ${v.detail}`);
    }
  }
  // 🚨 対照が死んでいたら（＝実物がそもそも壊れている）、自己検査の結果は読めるが
  //    本番判定は exit 1 になる（下の violations がそのまま実物の判定のため）。
  const controlTestFailed = !controlClean;

  // ── 本番の判定 ──────────────────────────────────────────────────────────
  const { violations, docsCount, indexCount, missingInIndex, missingOnDisk } = control;

  console.log("\n■ 判定");
  console.log(
    `  docs ${docsCount} 本 / 索引 ${indexCount} 行 / 欠け ${missingInIndex.length} / 余り ${missingOnDisk.length}`,
  );

  if (violations.length > 0) {
    console.error("\n  docs/ と docs/index.md が食い違っている:");
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.detail}`);
    }
    console.error(
      "\n  docs/ に新しいファイルを足したら docs/index.md にも 1 行足すこと（AGENTS.md §8）。" +
        "\n  ファイルを消した・移動したときは docs/index.md 側の行も削除・修正すること。",
    );
  } else {
    console.log("  OK — docs/ と docs/index.md は 1:1 で対応している。");
  }

  if (selfTestFailed) {
    console.error("\n🚨 自己検査（RED）に失敗した。この検査の結果は信用できない（緑でも意味を持たない）。");
  }
  if (controlTestFailed) {
    console.error("\n🚨 対照検査（GREEN）に失敗した＝実物の docs/ と docs/index.md が既に食い違っている。上の判定を直すこと。");
  }

  process.exit(violations.length === 0 && !selfTestFailed ? 0 : 1);
}

main();
