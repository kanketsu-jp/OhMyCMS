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
 *      🚨 **【訂正 2026-08-16】「CI の `checks` ジョブを足したので押された commit でも走ります」と
 *        書いたが、誤り。** `ci.yml` の引き金は `pull_request` と `workflow_dispatch` だけで
 *        **`push` が無い**。PR を開かない運用なので、**CI は一度も走っていない**
 *        （実測: workflow run の総数 = **0**。workflow は state=active、Actions は enabled=true、
 *        同じ鍵で repo も commit も読めるので、**「見えていない 0」ではない**）。
 *        → **この検査を守っているのは、いまも lefthook だけ**（＝`--no-verify` で素通りできる）。
 *        Dokploy のビルドでも走らない。
 *   2. **中身の正しさ** … 見ているのは「その文字列が実コードに在るか」だけ。
 *      🚨 **条件を反転させても通ります**（例: `if ! git check-ignore …` にする）。
 *      **在る/無いは見るが、意味は見ていません。**
 *   3. **実際の結果** … **ビルドしていません**。綺麗なツリーで本当に `dirty=0` が出るかは
 *      **押した後の `/api/health` でしか分かりません**。
 *   4. **`.dockerignore` の他の行** … 必要な行が在ることは見ますが、
 *      🚨 **後から広いパターン（`*` など）を足して全部除外しても通ります。**
 * 🚨 **【書いただけ】この節は古くなっても鳴りません**（理由は下段）。
 * 🚨 **【2026-08-16 追記】上の「見ていない範囲」は思いつきで書いていた。**
 *    **見逃す入力を 6 通り自分で作って通した**（写しの台の上。共有ツリーには 1 バイトも置いていない）。
 *    🟢 **対照**: 同じ台で `compose.dokploy.yml` の行を消すと **exit 1**
 *      ＝ **この台で検査は失敗を出せる**。だから下の「見逃す」は本物（対照が無ければ何も言えない）。
 *
 *    **6/6 すべて素通りした**（exit 0）。内訳:
 *      ① `.dockerignore` の末尾に `*` を足す      … 既知（下の 4 番）。**実測で確認**
 *      ② `if ! git check-ignore …` と反転させる    … 既知（下の 2 番）。**実測で確認**
 *      🚨 ③ `--build-arg` でなく **`env:` で `GIT_DIRTY` を渡す** … **新しく分かった穴**
 *      🚨 ④ `--build-arg $EXTRA_ARG` と **変数経由**で渡す        … **新しく分かった穴**
 *      🚨 ⑥ 判定の直後に **`DETECTED_DIRTY=0;` を入れて結果を捨てる** … **新しく分かった穴**
 *         （**判定は走る。走った結果が使われないだけ**。いちばん見つけにくい形）
 *      ⑤ `compose.dokploy.yml ` と**末尾に空白**を足す … 素通り。
 *         🚨 ただし**これが穴かは未確認**（この検査は行を trim して比べる。
 *         Docker 側が末尾の空白をどう扱うかを**測っていない**）
 *
 *    🚨 **この記述は「書いただけ」で、古くなっても鳴りません。**
 *      （`check-field-labels.ts` の同じ節は**鳴る側**にしてある——
 *        「見逃す」はずの入力が拾えるようになったら失敗する。ここは同じ形にできない）
 *      → **上の①〜⑥のどれかを塞いだ人は、この記述も一緒に直してください。**
 *
 *    🚨 **なぜ「毎回の出力に出す」形にしないか**: この検査は**ファイルを読む**ので、
 *    見逃しを実演するには**ファイルを書き換える**ことになる。共有ツリーでは窓が開く。
 *    → **再現手順**: 写しの台を作り（元と同じ相対パスで `.dockerignore` /
 *      `docker/Dockerfile` / `.github/workflows/ci.yml` と本ファイルを置く）、
 *      **先に対照（行を消す → exit 1）を採ってから**、上の①〜⑥を 1 つずつ当てる。
 *
 *   5. **読んでいるファイル** … `.dockerignore` / `docker/Dockerfile` / `.github/workflows/ci.yml` の**3 本だけ**。
 *      🚨 `compose.yml` / `compose.dokploy.yml` / `.env.example` も `GIT_DIRTY` に触れますが、**見ていません**
 *      （2026-08-15、「dirty に触れるのに検査が読んでいないファイル」を数えて分かったこと。
 *      ci.yml だけ塞ぎ、**残り 3 本は開いたまま**）。
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
// 🚨 **dirty に触るのに、この検査が読んでいなかったファイル**（2026-08-15・schema が「入口の抜け」を数えて発見）。
//    検査は `.dockerignore` と `docker/Dockerfile` しか読んでおらず、
//    **CI が `--build-arg GIT_DIRTY=0` で旗を宣言していた**のを一度も見ていなかった。
const ci = read(".github/workflows/ci.yml");

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
const コメントを落とす = (text) => text
  .split("\n")
  .map((line) => line.split("#")[0])
  .join("\n");

// 🚨 検査#3 の判定そのもの。**自己検査の囮は、この関数を呼ぶ**。
//    囮が「同じ内容の写し」だと、本物だけ続き文字へ戻されても囮は通ってしまう
//    （＝**囮が本物を見ていない**）。1 つしか無い形にしておく。
const 除外判定に当たる行か = (line) => line.includes("check-ignore") && line.includes("--no-index");

// ── コメント除去そのものの自己検査 ─────────────────────────
// 🚨 **「検出されるべきもの」だけを並べない。「検出されてはいけないもの」を必ず入れる**
//    （2026-08-15）。逆方向が無いと**過検出は永久に捕まらない**。
//    私はこの検査で実際に過検出を出している（`check-ignore\s+--no-index` の続き文字で
//    見ていて、`git check-ignore -q --no-index` を違反と言った）。
{
  const 見本 = [
    "# update-index --skip-worktree ← 行まるごとコメント",
    "  RUN true # update-index --skip-worktree ← 行の途中から",
    "  RUN git update-index --skip-worktree -- \"$tracked\"",
  ].join("\n");
  const 除去後 = コメントを落とす(見本);
  const 回数 = (除去後.match(/update-index\s+--skip-worktree/g) ?? []).length;
  // 🚨 検出されて**はいけない**もの（コメントの中の、それらしい文字列）が 2 件ある。
  //    実コードは 1 行だけなので、正しく落ちていれば **ちょうど 1**。
  if (回数 !== 1) {
    // 🚨 **どちら側に外れたかを名指しする。** 同じ文言にすると、読んだ人が反対側を探しに行く
    //    （2026-08-15「捕まえたことと、正しく名指しできることは別」）。
    //    実際、除去を殺す実験では **0**（数えなさすぎ）が出た。文言が「数えすぎ」固定だと嘘になる。
    console.error(`✖ 自己検査に失敗: 期待 1 / 実際 ${回数}`);
    console.error(回数 > 1
      ? "  🚨 **数えすぎ**です。コメントの中まで実装として数えています（「書いただけ」が通ります）。"
      : "  🚨 **数えなさすぎ**です。実コードまで落としています（この検査は常に「違反なし」を返します）。");
    console.error("  判定は出しません。");
    process.exit(2);
  }
  console.log(`自己検査: コメント除去 OK（見本 3 行中、実コードだけ 1 件を検出）`);

  // 🚨 **一度でも過検出した検査には、必ず囮を残す**（2026-08-15）。
  //    この検査は `check-ignore\s+--no-index` と**続き文字**で見ていて、
  //    **`git check-ignore -q --no-index` を違反と言った**（＝正しく書いてあるものを違反と言う）。
  //    直したが、囮が無いままだと**次に誰かが続き文字へ戻しても気づけない**。
  // 🚨 **囮ごとに「本物を見ているか」**（2026-08-16）。実測（述語を `() => false` に殺したとき）:
  //    期待 true の 3 本 … ✅ **❌ になる**（＝この 3 本は本物を見ている）
  //    期待 false の 1 本 … 🚨 **❌ にならない**。死んだ述語も false を返すので、
  //                        **期待どおりに見える**（構造上そうなる。過検出専用の囮）
  //                        → 🚨 **ただし写しではない。この 1 本だけを落とす壊し方が在る**:
  //                          【測った】`&& line.includes("--no-index")` を外す（＝過検出側へ倒す）
  //                          → **ずれるのは囮 1 件だけ**（期待 true の 3 本は通ったまま）
  //    ＝ 死活を見ているのは 3 本。1 本は過検出だけを見ているが、**自分の判定には繋がっている**。
  //    🚨 「同時に落ちる」は写しの証拠ではない（上流の共有部品なら当たり前）。
  //       **その囮だけが落ちる壊し方が別に在るか**——それが写しかどうかの判定基準（2026-08-16）。
  const 囮 = [
    ['          if git check-ignore --no-index -q -- "$tracked"', true],
    ['          if git check-ignore -q --no-index -- "$tracked"', true],  // 🚨 順が違うだけ。**通らねばならない**
    ['          if git check-ignore -q -- "$tracked"', false],            // --no-index が無い。**通ってはいけない**
    ['          # git check-ignore --no-index はコメント', true],         // 判定自体は当たる（除去は上でやる）
  ];
  const 誤り = 囮.filter(([line, 期待]) => 除外判定に当たる行か(line) !== 期待);
  if (誤り.length > 0) {
    console.error(`✖ 自己検査に失敗: 囮 ${誤り.length} 件で判定がずれています`);
    for (const [line] of 誤り) console.error(`    ${line.trim()}`);
    console.error("  🚨 続き文字での照合に戻っている可能性があります。判定は出しません。");
    process.exit(2);
  }
  console.log(`自己検査: 囮 ${囮.length} 件 OK（書き方を変えても通る／足りない形は通さない）`);
}

const 実コード = コメントを落とす(dockerfile.text);

const 行 = dockerignore.text.split("\n").map((l) => l.trim());

// 🚨 YAML も**同じ関数**でコメントを落とす（YAML も `#` がコメント）。
//    同じ処理を2回書くと、片方だけ直したときに**静かに食い違う**ので 1 つに寄せてある。
//    対象行 `--build-arg GIT_SHA=${{ github.sha }}` に `#` は無いので、切っても消えない
//    （消えたら対照が落ちて検査ごと失敗するので、黙って通ることはない）。
const CI実コード = コメントを落とす(ci.text);

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
    証拠: () => 行.find((l) => l === "compose.dokploy.yml") ?? "(見つからない)",

  },
  {
    名前: "gitinfo が skip-worktree で「文脈から外れた追跡ファイル」を吸収している",
    由来: "実測（消すと綺麗なツリーでも 19 本が \" D\" で復活することを docker build で確認）",
    ある: /update-index\s+--skip-worktree/.test(実コード),
    対照: /FROM base AS gitinfo/.test(実コード),
    対照の説明: "gitinfo ステージの宣言（同じ読み方で必ず見つかるもの）",
    壊れると: "綺麗なツリーでも 19 本が \" D\" で残り、dirty が常に 1 になる",
    証拠: () => 実コード.split("\n").find((l) => /update-index\s+--skip-worktree/.test(l))?.trim() ?? "(見つからない)",

  },
  {
    名前: "gitinfo が「除外されたから無い」と「本当に消された」を区別している",
    由来: "実測（追跡ファイルを消しても dirty=0 だった穴。docker build で RED→GREEN 済み）",
    // 🚨 skip-worktree を **無条件に**掛けると、**本当に消された追跡ファイルまで吸収**して
    //    dirty が 0 のままになる（2026-08-15 実測。docker build で再現済み）。
    //    `git check-ignore --no-index` で .dockerignore に当たるものだけを吸収する。
    // 🚨 **過検出を避ける**（2026-08-15）。最初は `check-ignore\s+--no-index` と続き文字で見ていたが、
    //    `git check-ignore -q --no-index` のように**フラグの順を変えただけで違反と言っていた**。
    //    **正しく書いてあるものを違反と言うのも、計器の故障**（取りこぼしと同じ重さ）。
    //    → **同じ行に両方在るか**で見る。
    ある: 実コード.split("\n").some(除外判定に当たる行か),
    対照: /update-index\s+--skip-worktree/.test(実コード),
    対照の説明: "skip-worktree の呼び出し（この検査が Dockerfile を読めている証拠）",
    壊れると: "追跡ファイルを消しても dirty が 0 のままになる（本当に汚れた像を見逃す）",
    証拠: () => 実コード.split("\n").find(除外判定に当たる行か)?.trim() ?? "(見つからない)",

  },
  {
    名前: ".dockerignore を文脈に残している（区別の材料）",
    由来: "先回り（この行を外すと上の区別ができなくなる。**実測で出た形ではない**）",
    // 自分自身を外すと、ビルドの中で「なぜ無いのか」を判定する材料が消える
    ある: !行.some((l) => l === ".dockerignore"),
    対照: 行.includes("compose.yml"),
    対照の説明: "compose.yml の行（同じ読み方で必ず見つかるもの）",
    壊れると: "check-ignore が判定できず、消された追跡ファイルを吸収してしまう",
    証拠: () => `.dockerignore を外す行は ${行.filter((l) => l === ".dockerignore").length} 件（0 が正しい）`,

  },
  {
    名前: "gitinfo が git status で dirty を判定している",
    由来: "先回り（判定そのものが消える形。**実測で出た形ではない**）",
    ある: /git status --porcelain/.test(実コード),
    対照: /DETECTED_DIRTY/.test(実コード),
    対照の説明: "DETECTED_DIRTY の宣言",
    壊れると: "判定そのものが消え、外から渡された値がそのまま出る（ツリーについて何も言わない値になる）",
    証拠: () => 実コード.split("\n").find((l) => /git status --porcelain/.test(l))?.trim() ?? "(見つからない)",

  },
  {
    名前: "dirty=1 のとき、内訳と出どころをビルドログへ出している",
    由来: "先回り（原因が追えなくなる形。**実測で出た形ではない**）",
    ある: /dirty の出どころ/.test(実コード),
    対照: /gitinfo:/.test(実コード),
    対照の説明: "gitinfo のログ出力",
    壊れると: "旗が立った理由が誰にも分からなくなる（今朝の状態へ戻る）",
    証拠: () => 実コード.split("\n").find((l) => /dirty の出どころ/.test(l))?.trim() ?? "(見つからない)",

  },
  {
    名前: "CI が dirty を「宣言」していない（GIT_DIRTY を渡していない）",
    由来: "実測（2026-08-15。ci.yml が `--build-arg GIT_DIRTY=0` を渡しており、"
      + "この検査は ci.yml を一度も読んでいなかった）",
    // 🚨 これは**唯一の否定形の検査**。「在ること」ではなく「**無いこと**」を見る。
    //    否定形は**探し方が壊れていても合格に見える**ので、対照（在るものが在ると出る）が特に効く。
    ある: !/--build-arg\s+GIT_DIRTY/.test(CI実コード),
    原因: () => "ci.yml が `--build-arg GIT_DIRTY=...` を渡しています"
      + "（この値はビルドしたツリーについて何も測っていません）",
    対照: /--build-arg\s+GIT_SHA/.test(CI実コード),
    対照の説明: "ci.yml の `--build-arg GIT_SHA`（同じ読み方で必ず見つかるもの。これが落ちたら ci.yml を読めていない）",
    壊れると: "CI が焼いたイメージの dirty が、測った値でなく**宣言した値**になる（旗が意味を失う）",
    証拠: () => `GIT_DIRTY を渡す行 ${CI実コード.split("\n").filter((l) => /--build-arg\s+GIT_DIRTY/.test(l)).length} 件（0 が正しい）`
      + ` / 🟢 対照: ${CI実コード.split("\n").find((l) => /--build-arg\s+GIT_SHA/.test(l))?.trim() ?? "(GIT_SHA が無い)"}`,

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
    // 🚨 **数と名前だけを出さない。拾った行そのものを添える**（2026-08-16・design の形）。
    //    「なぜその判定になったか」を読む人が自分で確かめられる。
    //    実際、件数だけを出していたせいで、同じ数が 3 回ひっくり返った例が今日あった。
    if (c.証拠) console.log(`     根拠: ${c.証拠()}`);
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
