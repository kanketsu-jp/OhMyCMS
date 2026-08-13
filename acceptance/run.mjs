#!/usr/bin/env node
/**
 * OhMyCMS v0.9 受入ハーネス。
 *
 *   bun run acceptance                  … docker を触らずに判定できるものだけ実行
 *   bun run acceptance --docker         … docker compose down -v → up も含めて実行（🚨 §注意）
 *   bun run acceptance --json           … 機械可読な出力（CI 用）
 *   bun run acceptance --only 7,8       … 指定した項目だけ
 *   bun run acceptance --base-url URL   … 既に起動しているサーバーへ向ける
 *
 * 🚨 --docker の注意:
 *   compose.yml は container_name を固定しているので、-p でプロジェクトを分けても
 *   並列に立てられない。`down -v` は他ペインのスタックと DB ボリュームを消す。
 *   **全ペインを止めてから**使うこと。
 *
 * 依存は0本（Node の標準機能だけ）。ブラウザ自動操作ライブラリも入れない。
 */

import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { probeBuildKind, probeStatus, probeTargetCommit, waitForHealth } from "./lib/http.mjs";
import { renderJson, renderTable } from "./lib/report.mjs";
import {
  compose,
  dockerAvailable,
  run,
  REPO_ROOT,
  runningOhmycmsContainers,
} from "./lib/proc.mjs";
import { STATUS, result } from "./lib/result.mjs";

import { check as check01 } from "./checks/01-docker-up.mjs";
import { check as check02 } from "./checks/02-env-only.mjs";
import { check as check03 } from "./checks/03-gui-reach.mjs";
import { check as check04 } from "./checks/04-cli.mjs";
import { check5, check6 } from "./checks/05-06-mcp.mjs";
import { check as check07 } from "./checks/07-i18n.mjs";
import { check as check08 } from "./checks/08-row-permission.mjs";
import { check as check09 } from "./checks/09-svg-attachment.mjs";

// ── V1 の受入基準（実装より先に書いてある）──
// 🚨 v0.9 の記録と**混ぜない**。`--v1` を付けたときだけ走り、そのときは V1 だけを走らせる。
//    （開発ビルドと本番ビルドを別記録にしたのと同じ考え方・司令塔の指示）
import { check as checkV1A } from "./checks/v1-a-saml.mjs";
import { check as checkV1B } from "./checks/v1-b-storage.mjs";
import { checkTiptap as checkV1C, checkOtp as checkV1D } from "./checks/v1-cd-editor-otp.mjs";

/**
 * ポート割り当ては knowledge/decisions/port-allocation.md。
 * 🚨 DEV_PORT(studio-acc) と**必ず別**にする。規約表の「受入ハーネス 3103」は studio-acc を指すので、
 *    基準1・2 が立てる本番スタックは 3105 を使う。同じにすると F9 で取り合う（sdk が実測で発見）。
 */
// 🚨 基準1・2 が立てる **本番構成のスタック**が使うポート。
// studio-acc（開発ビルド・3999）と**必ず別**にする。同じにすると
// 「ハーネス自身が立てた studio-acc が 3999 を掴んだまま、
//  基準1 の up が同じ 3999 へ bind しようとして落ちる」。
// 実際にそれで基準1 が FAIL した（2026-08-13）。
const DOCKER_PORT = 3105;
/** dev モードの studio（受入基準8・9 用）。compose.acceptance.yml と揃えること。
 *  ポート規約: 受入ハーネスは 3103（knowledge/decisions/port-allocation.md）。 */
const DEV_PORT = 3103;

/**
 * 🚨 **--docker の本番スタックと studio-acc は別のポートでなければならない。**
 * 同じ番号だと、studio-acc が起動したまま --docker を打った瞬間にポートを取り合い、
 * 「なぜか起動しない」という分かりにくい失敗になる。
 * ポート規約（knowledge/decisions/port-allocation.md）では
 * Studio 本番=3101 / 受入ハーネス(studio-acc)=3103。
 * 番号の割り当ては infra の担当なので、ここでは**黙って直さず、気づける形で止める**。
 */
function assertPortsDoNotCollide() {
  if (DOCKER_PORT !== DEV_PORT) return;
  process.stderr.write(
    `\n🚨 ハーネスの設定が壊れています: DOCKER_PORT と DEV_PORT がどちらも ${DOCKER_PORT} です。\n` +
      "   DOCKER_PORT = --docker で立てる本番スタック / DEV_PORT = studio-acc（受入用の開発ビルド）。\n" +
      "   同じ番号だと両方を同時に立てられません（F9 の総合受入で必ず踏みます）。\n" +
      "   ポート規約: Studio 本番 3101 / 開発 3102 / 受入ハーネス 3103 / Storybook 3104\n" +
      "   → acceptance/run.mjs の DOCKER_PORT を 3101 へ（割り当ての判断は infra）。\n\n",
  );
}

function parseArgs(argv) {
  const args = {
    docker: false,
    json: false,
    only: null,
    baseUrl: null,
    noUp: false,
    down: false,
    red: null,
    v1: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--docker") args.docker = true;
    else if (arg === "--v1") args.v1 = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--no-up") args.noUp = true;
    else if (arg === "--down") args.down = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--only") args.only = (argv[++i] ?? "").split(",").map((n) => Number(n.trim()));
    else if (arg === "--red") args.red = (argv[++i] ?? "").split(",").map((n) => Number(n.trim()));
    else if (arg === "--base-url") args.baseUrl = argv[++i];
  }
  return args;
}

const HELP = `OhMyCMS v0.9 受入ハーネス

  bun run acceptance                  docker を触らずに判定できるものだけ
  bun run acceptance --docker         docker compose down -v → up も実行（全ペインを止めてから）
  bun run acceptance --json  機械可読な出力（CI 用）
                                   CI からは node acceptance/run.mjs --json でもよい
  bun run acceptance --only 7,8       指定した項目だけ
  bun run acceptance --v1             V1 の受入基準だけ（v0.9 の記録と混ぜない）
  bun run acceptance --base-url URL   既に起動しているサーバーへ向ける
  bun run acceptance --no-up          studio-acc を自動起動しない
  bun run acceptance --down           studio-acc を止めて終了する
  bun run acceptance --red 8          RED 確認: その項目をわざと壊して FAIL になることを見る

判定は PASS / FAIL / SKIP / BLOCKED / MANUAL の5種類。
**PASS 以外が1つでもあれば未達（exit 1）**。未実装のものを PASS にはしない。

受入基準8・9 は acceptance/compose.acceptance.yml の studio-acc（開発ビルド・3999）へ
向けて実行する。本番ビルドでは dev-login が消えていてセッションを作れないため。
🚨 したがって 8・9 の結果は **開発ビルドでの結果**であり、本番ビルドでも同じかは別の話。
`;

/** .env.example をコピーして STUDIO_PORT だけ足した一時 env を作る。元の .env は触らない。 */
function makeEnvFile(port) {
  const example = readFileSync(join(REPO_ROOT, ".env.example"), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "ohmycms-acc-"));
  const file = join(dir, "acceptance.env");
  // 「.env.example をコピーしただけで動く」ことの検証なので、中身は足さずに
  // STUDIO_PORT だけ上書きする（他ペインとポートを取り合わないため）。
  writeFileSync(file, `${example}\nSTUDIO_PORT=${port}\n`);
  return file;
}

async function gitHead() {
  const probe = await run("git", ["rev-parse", "--short", "HEAD"]);
  return probe.code === 0 ? probe.stdout.trim() : "unknown";
}

/** --only で絞られたとき、指定 id のどれかが対象に入っているか。 */
function wantsAny(args, ids) {
  return !args.only || ids.some((id) => args.only.includes(id));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  // 🚨 --docker は両方のポートを使うので、衝突していたら**走らせない**。
  //    走らせてしまうと「起動しない」だけが見えて、原因がポートだと分からない。
  if (args.docker && DOCKER_PORT === DEV_PORT) {
    assertPortsDoNotCollide();
    return 2;
  }
  if (DOCKER_PORT === DEV_PORT && !args.json) assertPortsDoNotCollide();

  const startedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  const head = await gitHead();

  const envFile = makeEnvFile(DOCKER_PORT);
  const context = {
    dockerAllowed: args.docker,
    dockerBaseUrl: `http://localhost:${DOCKER_PORT}`,
    dockerPort: DOCKER_PORT,
    composeFiles: ["compose.yml"],
    envFile,
    // 受入基準8・9 が叩く先。--base-url が無ければ dev モードの studio。
    baseUrl: args.baseUrl ?? `http://localhost:${DEV_PORT}`,
    // RED 確認用。指定した項目をわざと壊れた状態で走らせる（F9h 受入基準3）。
    red: args.red ?? [],
    // 🚨 対象が手元かどうか。遠隔（Dokploy 上のインスタンス等）なら、
    //   手元の情報しか見ていない項目を PASS のままにしない（下の REMOTE_UNMEASURABLE）。
    remoteTarget: !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(
      args.baseUrl ?? `http://localhost:${DEV_PORT}`,
    ),
  };

  if (context.remoteTarget && !args.json) {
    process.stderr.write(
      `\n⚠ 対象が手元ではありません（${context.baseUrl}）。\n` +
        "  手元のリポジトリや docker しか見ていない項目（1・2・7・8・10）は BLOCKED にします。\n" +
        "  そのままだと「デプロイ先で PASS」という空の合格になるためです。\n\n",
    );
  }

  if (context.red.length > 0 && !args.json) {
    process.stderr.write(
      `\n⚠ RED 確認モード: 項目 ${context.red.join(",")} をわざと壊して実行します。` +
        "FAIL になるのが正しい結果です。\n\n",
    );
  }

  const ACC_COMPOSE = ["compose.yml", "acceptance/compose.acceptance.yml"];

  if (args.down) {
    const stop = await compose(ACC_COMPOSE, ["--env-file", envFile, "rm", "-sf", "studio-acc"]);
    process.stdout.write(
      stop.code === 0
        ? "studio-acc を止めました（db は残しています）\n"
        : `studio-acc の停止に失敗: exit ${stop.code}\n${stop.stderr}\n`,
    );
    return stop.code === 0 ? 0 : 1;
  }

  // ── 受入基準8・9 のために dev モードの studio を立てる ──
  // 既に応答しているなら何もしない。--base-url が指定されていれば触らない。
  let devBuildTarget = false;
  if (!args.baseUrl && !args.noUp && wantsAny(args, [4, 8, 9])) {
    const already = await probeStatus(context.baseUrl);
    if (already !== 200) {
      const docker = await dockerAvailable();
      if (docker.ok) {
        if (!args.json) process.stderr.write("studio-acc（開発ビルド・3999）を起動しています…\n");
        // 焼き込む版を渡しておくと、次回から「対象がどの版か」を言える
        const up = await compose(ACC_COMPOSE, [
          "--env-file", envFile, "up", "-d", "--build", "studio-acc",
        ], { env: { OHMYCMS_GIT_COMMIT: head } });
        if (up.code !== 0 && !args.json) {
          process.stderr.write(`studio-acc の起動に失敗: exit ${up.code}\n${up.stderr.slice(-800)}\n`);
        }
        await waitForHealth(context.baseUrl, { timeoutMs: 240_000 });
      }
    }
  }

  // 🚨 **フラグではなく実測で**開発／本番を判定する。
  //   以前は `--base-url` を付けたときだけ devBuildTarget が false のままになり、
  //   「開発ビルドでの結果です」の但し書きが**消えていた**。
  //   どの環境に対する結果かが混ざると、後で判断を誤る（司令塔の指摘・2026-08-13）。
  const buildKind = await probeBuildKind(context.baseUrl);
  // 🚨 リポジトリの HEAD ではなく、**対象が動かしている版**を取る（焼き込みで古いことがある）
  const targetCommit = buildKind === "unreachable" ? null : await probeTargetCommit(context.baseUrl);
  devBuildTarget = buildKind === "dev";
  context.devBuildTarget = devBuildTarget;
  context.buildKind = buildKind;

  // --docker のとき、他ペインのスタックを壊さないよう先に警告する。
  if (args.docker) {
    const running = await runningOhmycmsContainers();
    if (running.length > 0 && !args.json) {
      process.stderr.write(
        `\n⚠ 稼働中の ohmycms コンテナが ${running.length} 個あります。` +
          `--docker はこれらを down -v で消します:\n` +
          running.map((c) => `    ${c.name}  ${c.ports}`).join("\n") +
          "\n\n",
      );
    }
  }

  const results = [];

  const wanted = (id) => !args.only || args.only.includes(id);

  const runCheck = async (id, fn, title) => {
    if (!wanted(id)) return;
    try {
      results.push(await fn(context));
    } catch (error) {
      results.push(
        result({
          id,
          title,
          status: STATUS.FAIL,
          details: [
            "ハーネス自身が例外で落ちました（チェック対象の問題とは限りません）:",
            `    ${error?.stack ?? error}`,
          ],
        }),
      );
    }
  };

  if (args.v1) {
    // V1 の基準だけを走らせる（v0.9 の記録と混ぜない）
    await runCheck(10, checkV1B, "V1-B ストレージ（S3 互換）");
    await runCheck(11, checkV1C, "V1-C Tiptap の WYSIWYG");
    await runCheck(12, checkV1D, "V1-D メール OTP");
    await runCheck(13, checkV1A, "V1-A SAML（SSO）");
  } else {
  await runCheck(1, check01, "docker compose up だけで起動する");
  await runCheck(2, check02, "環境変数だけで設定が完結する");
  await runCheck(3, check03, "GUI から全機能へ到達できる（操作の確認は manual-3.md）");
  await runCheck(4, check04, "CLI で同じことができる");
  await runCheck(5, check5, "MCP 経由で触れ、権限が同じように効く");
  await runCheck(6, check6, "管理者トークンなら MCP から設定も編集できる");
  await runCheck(7, check07, "UI が日本語・英語に切り替わる / ハードコード無し");
  await runCheck(8, check08, "他人の行に直打ち → 403/404");
  await runCheck(9, check09, "SVG/HTML が attachment で配信される");
  }

  results.sort((a, b) => a.id - b.id);

  // ── 🚨 対象が「手元」でないとき、測れていない項目を PASS のままにしない ──
  //   司令塔の指示（2026-08-13）で、受入を **Dokploy 上のインスタンス**へも回す予定。
  //   `--base-url` で外は指せるが、**一部の項目は対象を見ていない**ので、
  //   そのままだと「デプロイ先で 7 PASS」という**空の合格**になる。
  //   （今日 v0.9 で「開発ビルドで 7 PASS は出荷物の証明にならない」と言われたのと同じ形）
  const REMOTE_UNMEASURABLE = {
    1: "docker compose を手元で叩く項目なので、遠隔の対象については何も言えません。",
    2: "手元の .env.example を見る項目なので、遠隔の対象については何も言えません。",
    7: "🚨 **この項目は対象へ一切アクセスしていません**（手元のリポジトリの辞書だけを見ます）。"
      + "デプロイ先の中身が古くても PASS になるため、遠隔の対象では判定できません。",
    8: "他人の行を作るのに dev-login か DB へのブートストラップが要ります。どちらも手元の docker 前提です。",
    10: "保存先が s3 かを DB（docker exec psql）で確かめる項目なので、遠隔の対象では確かめられません。",
  };
  if (context.remoteTarget) {
    for (const r of results) {
      const why = REMOTE_UNMEASURABLE[r.id];
      if (!why) continue;
      if (r.status === STATUS.PASS || r.status === STATUS.FAIL) {
        r.details.push(`⚠ 元の判定: ${r.status}（手元の情報にもとづくもの）`);
      }
      r.status = STATUS.BLOCKED;
      r.reason = `遠隔の対象では判定できません（${context.baseUrl}）`;
      r.details.push(why);
    }
  }

  // 🚨 基準8・9 は開発ビルドの studio-acc で判定している。
  //    本番ビルドでも同じ結果になるかは別の話なので、出力に必ず残す（司令塔の指示・2026-08-13）。
  if (context.devBuildTarget) {
    for (const r of results) {
      if (r.id === 8 || r.id === 9) {
        r.details.push(
          "⚠ この判定は **開発ビルド**（acceptance/compose.acceptance.yml の studio-acc・3999）での結果です。" +
            "本番ビルドでは dev-login が消えるためセッションを作れず、ここでは判定できません。" +
            "本番ビルドでの確認は F0c/F0d と F9 の総合受入で別途行ってください。",
        );
      }
    }
  }

  const meta = {
    startedAt,
    finishedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    head,
    baseUrl: context.baseUrl,
    buildKind: context.buildKind,
    targetCommit,
  };

  if (args.json) process.stdout.write(`${renderJson(results, meta)}\n`);
  else process.stdout.write(renderTable(results, meta));

  const achieved = results.every((r) => r.status === STATUS.PASS);
  return achieved ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`受入ハーネスが落ちました: ${error?.stack ?? error}\n`);
    process.exit(2);
  },
);
