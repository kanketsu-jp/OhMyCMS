/**
 * 受入基準10: **MCP の 22 ツールを、本物のプロトコルで 1 回ずつ叩く**。
 *
 * 由来（2026-08-15・実害あり）: `/api/health` が `fd53fdd` で `version` を返すようになったのに
 * MCP 側の出力スキーマを直さなかったため、**`ohmycms_health` が約1日まるごと壊れていた**
 * （`-32602 Structured content does not match the tool's output schema`）。
 *
 * 🚨 **なぜ既存の検査では捕まらなかったか。3 つとも緑のままだった:**
 *   - `tsc`         … 型は通る（スキーマは実行時の検証で、型の話ではない）
 *   - lefthook      … `packages/` は root: "apps/studio" の外なので**そもそも見ていなかった**
 *   - 受入ハーネス  … 05-06 が MCP を叩いてはいるが、**呼ぶツールは 10 種だけ**。
 *                     `ohmycms_health` は**一度も呼ばれていなかった**
 *     実測（2026-08-15）: カタログ 22 ツール / ハーネスが呼ぶ 10 種 → **未使用 15 種以上**
 *
 * つまり穴は「検査が無い」ではなく「**検査が届く範囲の外**」だった。
 * `packages/mcp/scripts/verify.mjs` は**全ツールを列挙して 1 回ずつ叩く**ので、この形の事故を捕まえる。
 * ここではそれを受入ハーネスから走らせる（**サーバと DB が既に立っている唯一の場所**だから）。
 *
 * 🚨 CI には置けない。`.github/workflows/ci.yml` は `on: [pull_request, workflow_dispatch]` で、
 *    私たちは PR を作らず main へ直接 push しているため、**CI は一度も発火していない**
 *    （実測: `repos/kanketsu-jp/{OhMyCMS,cms}/actions/runs` → total_count 0。
 *      🟢 対照(+): 同じ経路で `hrdr-ai-team` は 8 / `OhMyShare` は 18 を返す＝経路は生きている）。
 *    pre-commit にも置けない（dist のビルドと生きたサーバと DB が要る）。
 *
 * RED/GREEN を実測してある（2026-08-15）:
 *   HEALTH_OUTPUT から `version` を消してビルド → verify.mjs が **exit 1**、
 *     エラーは当時と同じ `-32602 … data must NOT have additional properties`
 *   戻してビルド → **exit 0**（全項目 PASS）
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, run } from "../lib/proc.mjs";
import { assertion, result, statusFromAssertions } from "../lib/result.mjs";

const SERVER_ENTRY = join(REPO_ROOT, "packages/mcp/dist/index.js");
const BUILD_COMMAND = ["--filter", "./packages/*", "build"];

export async function check({ baseUrl }) {
  const started = Date.now();
  const details = [];

  if (!existsSync(join(REPO_ROOT, "packages/mcp/scripts/verify.mjs"))) {
    return result({
      id: 10,
      title: "MCP の全ツールを実プロトコルで叩く",
      status: "SKIP",
      details: ["packages/mcp/scripts/verify.mjs がありません（未実装）"],
      assertions: [],
      ms: Date.now() - started,
    });
  }

  // 🚨 dist の有無で実装の有無を判定しない（.gitignore なので clone 直後は必ず無い）。
  //    05-06 と同じ作法で、判定の前に必ずビルドする。
  const build = await run("bun", BUILD_COMMAND);
  if (build.code !== 0) {
    details.push(`ビルドに失敗: exit ${build.code}`);
    return result({
      id: 10,
      title: "MCP の全ツールを実プロトコルで叩く",
      status: "FAIL",
      details: [...details, build.stderr.split("\n").slice(-5).join("\n")],
      assertions: [],
      ms: Date.now() - started,
    });
  }
  if (!existsSync(SERVER_ENTRY)) {
    details.push(`ビルドは成功したのに ${SERVER_ENTRY} がありません`);
  }

  const verify = await run("node", [join(REPO_ROOT, "packages/mcp/scripts/verify.mjs")], {
    env: { ...process.env, OHMYCMS_URL: baseUrl },
  });
  const output = `${verify.stdout}\n${verify.stderr}`;

  // 🚨 「落ちなかった」を PASS にしない。**全ツールを列挙して叩けたこと**まで見る。
  //    verify.mjs は最初に `ツール NN 個 — …` を出すので、その行が無ければ
  //    「通った」のではなく「そこまで到達していない」。
  //
  // 🚨 **この肯定形が何によって成立しているか**（司令塔 2026-08-15「3段目」）:
  //    **`packages/mcp/scripts/verify.mjs` が「ツール NN 個」という文字列を出し続けること**に
  //    乗っている。**私の検査が持っている性質ではない。**
  //    → 向こうが文言を変えたら、この肯定形は **0 件になり FAIL する**（安全側に倒れる）。
  //      **黙って PASS にはならない**ので副作用としては安全だが、
  //      **赤くなった理由が「文言が変わった」でありうる**ことを、ここに書いておく。
  //      （数を出す側と数える側が別のファイルにある限り、この依存は消えない）
  const listed = output.match(/ツール\s+(\d+)\s+個/);
  const toolCount = listed ? Number(listed[1]) : 0;

  // 🚨 肯定形を先に置く。**否定形（スキーマ不一致が出ない）は、サーバへ届いていなければ
  //    自明に成立する**（dev-login が 500 でも「不一致は出ていない」になる。実際にそうなった）。
  //    だから「ツールを列挙して叩けた」を先に見て、そのうえで否定形を見る。
  const assertions = [
    assertion(
      "positive",
      "全ツールを列挙して実際に叩けた（0 なら到達していない）",
      toolCount > 0,
      `ツール ${toolCount} 個`,
      "1 個以上",
    ),
    assertion(
      "negative",
      "出力スキーマの不一致（-32602）が出ていない",
      verify.code === 0 && !/-32602/.test(output),
      verify.code === 0 ? "不一致なし" : `exit ${verify.code}${/-32602/.test(output) ? " / -32602" : ""}`,
      "不一致なし",
    ),
  ];

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 10,
    title: "MCP の全ツールを実プロトコルで叩く",
    status: verdict.status,
    positive: `ツール ${toolCount} 個を実プロトコルで呼び出し`,
    negative:
      verify.code === 0 ? "スキーマ不一致なし" : "スキーマ不一致または呼び出し失敗",
    details: [
      ...details,
      ...output.split("\n").filter((line) => /❌|想定外|-32602/.test(line)).slice(0, 6),
      ...verdict.details,
    ],
    repro:
      verdict.status === "PASS"
        ? []
        : [
            "bun --filter './packages/*' build",
            `OHMYCMS_URL=${baseUrl} node packages/mcp/scripts/verify.mjs`,
          ],
    assertions,
    ms: Date.now() - started,
  });
}

export const meta = { id: 10, needsServer: true };
