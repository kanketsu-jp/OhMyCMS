/**
 * 受入基準1: `docker compose up` だけで DB もアプリも起動し `/api/health` が 200。
 *
 * 🚨 このチェックは既定では走らない（BLOCKED を返す）。理由:
 *   compose.yml は `name: ohmycms` に加えて **各サービスに container_name を固定**している。
 *   したがって -p でプロジェクト名を分けても同じコンテナ名を取り合い、並列に立てられない。
 *   `docker compose down -v` は **他ペインが動かしているスタックと DB ボリュームを消す**。
 *   → `--docker` を明示したときだけ実行する。00契約の
 *     「F9 の総合受入は全ペインの作業を止めた状態で --build から通す」と同じ考え方。
 *
 * 肯定形 / 否定形:
 *   否定形 … down -v の直後、`/api/health` が 200 にならない（= 前の状態が残っていない）
 *   肯定形 … up -d --build のあと 200 になる
 *   この順番が本質。「200 になった」だけでは、前から動いていたものを見ている可能性がある。
 */

import { probeStatus, waitForHealth } from "../lib/http.mjs";
import { compose, dockerAvailable, runningOhmycmsContainers } from "../lib/proc.mjs";
import { assertion, result, statusFromAssertions } from "../lib/result.mjs";

export async function check(context) {
  const started = Date.now();
  const { dockerAllowed, dockerBaseUrl, composeFiles, envFile } = context;

  if (!dockerAllowed) {
    return result({
      id: 1,
      title: "docker compose up だけで起動する",
      status: "BLOCKED",
      reason: "--docker 未指定（F9 の総合受入時に --docker で判定する）",
      details: [
        "🚨 **この項目は F9（総合受入）のときに `--docker` を付けて判定します。** それまでは BLOCKED のままが正しい状態です。",
        "",
        "なぜ既定で走らせないか（2つとも実測）:",
        "  1. compose.yml は各サービスに container_name を固定しているので、-p でプロジェクト名を",
        "     分けても同じコンテナ名を取り合う。並列に立てられない。",
        "  2. `down -v` は共有ボリュームを破棄するため、いま DB に入っている他トラックの",
        "     検証データ（ユーザー・ポリシー・権限行・ファイル・エージェント・各トラックの",
        "     検証用コレクション）をまとめて消す。",
        "",
        "→ F9 の直前に司令塔が全トラックへ「DB を消す」と予告し、全ペインを止めてから実行します。",
      ],
      repro: ["pnpm acceptance --docker   # 🚨 全ペインを止めてから。DB のデータは消えます"],
      ms: Date.now() - started,
    });
  }

  const docker = await dockerAvailable();
  if (!docker.ok) {
    return result({
      id: 1,
      title: "docker compose up だけで起動する",
      status: "BLOCKED",
      reason: "docker が使えません",
      details: [docker.reason],
      repro: ["docker info"],
      ms: Date.now() - started,
    });
  }

  const assertions = [];
  const details = [];

  // ── 否定形: まっさらにして、200 にならないことを確かめる ──
  const down = await compose(composeFiles, ["--env-file", envFile, "down", "-v"]);
  if (down.code !== 0) details.push(`down -v が exit ${down.code}: ${down.stderr.trim().slice(0, 300)}`);

  const beforeStatus = await probeStatus(dockerBaseUrl);
  assertions.push(
    assertion("negative", "down -v の直後は /api/health が 200 にならない",
      beforeStatus !== 200, beforeStatus === 0 ? "000 (接続不可)" : beforeStatus, "200 以外"),
  );

  const stillRunning = await runningOhmycmsContainers();
  assertions.push(
    assertion("negative", "down -v の後に ohmycms コンテナが残っていない",
      stillRunning.length === 0, `${stillRunning.length} 個`, "0 個"),
  );

  // ── 肯定形: up -d --build だけで 200 になる ──
  const up = await compose(composeFiles, ["--env-file", envFile, "up", "-d", "--build"]);
  if (up.code !== 0) {
    details.push(`up -d --build が exit ${up.code}:`);
    for (const line of (up.stderr || up.stdout).trim().split("\n").slice(-15)) {
      details.push(`    ${line}`);
    }
  }
  assertions.push(
    assertion("positive", "docker compose up -d --build が成功する", up.code === 0, `exit ${up.code}`, "exit 0"),
  );

  const afterStatus = await waitForHealth(dockerBaseUrl, { timeoutMs: 180_000 });
  assertions.push(
    assertion("positive", "/api/health が 200 を返す", afterStatus === 200,
      afterStatus === 0 ? "000 (接続不可)" : afterStatus, "200"),
  );

  // migrate が成功して初めて studio が上がる構成なので、DB も動いていることの裏取りになる。
  const running = await runningOhmycmsContainers();
  const hasDb = running.some((c) => c.name === "ohmycms-db");
  const hasStudio = running.some((c) => c.name === "ohmycms-studio");
  assertions.push(
    assertion("positive", "DB とアプリの両方のコンテナが動いている", hasDb && hasStudio,
      running.map((c) => c.name).join(", ") || "(なし)", "ohmycms-db と ohmycms-studio"),
  );

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 1,
    title: "docker compose up だけで起動する",
    status: verdict.status,
    positive: afterStatus === 0 ? "000" : String(afterStatus),
    negative: beforeStatus === 0 ? "000" : String(beforeStatus),
    details: [...details, ...verdict.details],
    repro:
      verdict.status === "PASS"
        ? []
        : [
            `docker compose --env-file ${envFile} down -v`,
            `docker compose --env-file ${envFile} up -d --build`,
            `curl -sS -o /dev/null -w '%{http_code}\\n' ${dockerBaseUrl}/api/health`,
          ],
    assertions,
    ms: Date.now() - started,
  });
}

export const meta = { id: 1, needsServer: false };
