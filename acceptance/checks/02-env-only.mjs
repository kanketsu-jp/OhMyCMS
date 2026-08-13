/**
 * 受入基準2: 環境変数だけで設定が完結する（`.env.example` をコピーしただけで動く）。
 *
 * 判定の組み立て:
 *   肯定形 … `.env.example` をそのままコピーした .env で起動でき、
 *            さらに **既定と違う値（STUDIO_PORT）を書くとそれが効く**
 *   否定形 … その「違う値」を入れたとき、**既定のポートでは応答しない**
 *
 * 否定形が要る理由: 「3999 で 200 が返った」だけでは、たまたま別のプロセスが
 * そのポートを掴んでいた可能性を排除できない。既定ポートが黙って生きていないことも見る。
 *
 * このチェックも docker を触るので、基準1 と同じく `--docker` 前提。
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { probeStatus, waitForHealth } from "../lib/http.mjs";
import { compose, dockerAvailable, REPO_ROOT } from "../lib/proc.mjs";
import { assertion, result, statusFromAssertions } from "../lib/result.mjs";

/** .env.example が実際に持っているキー（値の中身は読み書きしない）。 */
async function exampleKeys() {
  const text = await readFile(join(REPO_ROOT, ".env.example"), "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")));
}

/** compose.yml が参照している環境変数（${FOO} / ${FOO:-default}）。 */
async function composeReferencedKeys() {
  const text = await readFile(join(REPO_ROOT, "compose.yml"), "utf8");
  const keys = new Set();
  for (const match of text.matchAll(/\$\{([A-Z0-9_]+)(?::-[^}]*)?\}/g)) keys.add(match[1]);
  return [...keys];
}

export async function check(context) {
  const started = Date.now();
  const { dockerAllowed, dockerBaseUrl, dockerPort, composeFiles, envFile } = context;

  const assertions = [];
  const details = [];

  // ── docker を触らなくても判定できる部分（設定の網羅性）は先にやる ──
  const keys = await exampleKeys();
  const referenced = await composeReferencedKeys();
  const missing = referenced.filter((k) => !keys.includes(k));

  assertions.push(
    assertion("positive", ".env.example にキーが定義されている", keys.length > 0,
      `${keys.length} 件`, "1 件以上"),
  );
  assertions.push(
    assertion("negative", "compose.yml が参照するのに .env.example に無いキーが無い",
      missing.length === 0, missing.length ? missing.join(", ") : "0 件", "0 件"),
  );

  if (!dockerAllowed) {
    return result({
      id: 2,
      title: "環境変数だけで設定が完結する",
      status: "BLOCKED",
      reason: "--docker 未指定（F9 の総合受入時に --docker で判定する）",
      positive: `.env.example ${keys.length} キー`,
      negative: missing.length ? `不足 ${missing.length}` : "不足 0",
      details: [
        "静的な検査（compose.yml が参照するキーが .env.example に揃っているか）だけは実施しました:",
        `    .env.example のキー ${keys.length} 件 / compose.yml が参照 ${referenced.length} 件 / 不足 ${missing.length} 件`,
        ...(missing.length ? [`    不足しているキー: ${missing.join(", ")}`] : []),
        "",
        "🚨 起動を伴う確認（.env.example をコピーしただけで動く・STUDIO_PORT が効く）は",
        "**F9（総合受入）のときに `--docker` を付けて判定します。** それまでは BLOCKED が正しい状態です。",
        "理由は #1 と同じ（down -v が他トラックの検証データを消すため）。",
      ],
      repro: ["bun run acceptance --docker   # 🚨 全ペインを止めてから。DB のデータは消えます"],
      assertions,
      ms: Date.now() - started,
    });
  }

  const docker = await dockerAvailable();
  if (!docker.ok) {
    return result({
      id: 2,
      title: "環境変数だけで設定が完結する",
      status: "BLOCKED",
      reason: "docker が使えません",
      details: [docker.reason],
      assertions,
      ms: Date.now() - started,
    });
  }

  // ── 基準1 が既に up 済みの前提で、STUDIO_PORT が効いていることを確認する ──
  // envFile は .env.example のコピーに STUDIO_PORT だけ足したもの（run.mjs が作る）。
  const configured = await waitForHealth(dockerBaseUrl, { timeoutMs: 120_000 });
  assertions.push(
    assertion("positive", `STUDIO_PORT=${dockerPort} が効いて ${dockerPort} で 200`,
      configured === 200, configured === 0 ? "000" : configured, "200"),
  );

  // 否定形: 既定ポート(3000)では応答しない = ポート設定が本当に効いている
  const defaultPortStatus = await probeStatus("http://localhost:3000");
  assertions.push(
    assertion("negative", "既定の 3000 では acceptance のスタックが応答しない",
      defaultPortStatus !== 200 || dockerPort === 3000,
      defaultPortStatus === 0 ? "000" : defaultPortStatus, "200 以外"),
  );
  if (defaultPortStatus === 200) {
    details.push(
      "注意: 3000 が 200 を返しています。トラックC のホスト dev サーバーの可能性が高く、" +
        "この否定形は環境の都合で信用できません。全ペインを止めてから再実行してください。",
    );
  }

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 2,
    title: "環境変数だけで設定が完結する",
    status: verdict.status,
    positive: String(dockerPort),
    negative: defaultPortStatus === 0 ? "000" : String(defaultPortStatus),
    details: [...details, ...verdict.details],
    repro:
      verdict.status === "PASS"
        ? []
        : [
            "cp .env.example /tmp/acc.env && echo 'STUDIO_PORT=3999' >> /tmp/acc.env",
            "docker compose --env-file /tmp/acc.env up -d --build",
            `curl -sS -o /dev/null -w '%{http_code}\\n' ${dockerBaseUrl}/api/health`,
          ],
    assertions,
    ms: Date.now() - started,
  });
}

export const meta = { id: 2, needsServer: false };
