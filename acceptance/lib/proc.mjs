/**
 * 外部コマンド実行と docker compose の薄いラッパ。
 * 依存を増やさないため child_process だけを使う。
 */

import { spawn } from "node:child_process";

export const REPO_ROOT = new URL("../../", import.meta.url).pathname;

/**
 * コマンドを実行して { code, stdout, stderr } を返す。throw しない
 * （失敗も「実測値」として判定に使うため）。
 */
export function run(command, args, { cwd = REPO_ROOT, env, timeoutMs = 600_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...(env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      stderr += `\n[acceptance] ${timeoutMs}ms でタイムアウトしたので kill しました`;
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(error?.message ?? error) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** docker が使えるか。使えないなら理由を返す。 */
export async function dockerAvailable() {
  const probe = await run("docker", ["info", "--format", "{{.ServerVersion}}"], {
    timeoutMs: 20_000,
  });
  if (probe.code !== 0) {
    return { ok: false, reason: (probe.stderr || probe.stdout).trim().split("\n")[0] };
  }
  return { ok: true, version: probe.stdout.trim() };
}

/**
 * いま動いている ohmycms 系コンテナの一覧。
 *
 * 🚨 compose.yml は container_name を固定しているので、-p でプロジェクト名を分けても
 * 同じ名前のコンテナを取り合う。したがって `down -v` は**他ペインのスタックを壊す**。
 * 実行前に必ずこれで確認する。
 */
export async function runningOhmycmsContainers() {
  const probe = await run(
    "docker",
    ["ps", "--format", "{{.Names}}\t{{.Ports}}\t{{.Status}}"],
    { timeoutMs: 20_000 },
  );
  if (probe.code !== 0) return [];
  return probe.stdout
    .split("\n")
    .map((line) => line.trim())
    // 🚨 ohmycms-studio-acc は **ハーネス自身が立てた** 検証用コンテナ（受入基準8・9 用）で、
    //    compose.yml のスタックには属さない。基準1 の「down -v で全部消えたか」に
    //    これを数えると、ハーネスが自分の足を踏んで必ず FAIL する（2026-08-13 実測）。
    .filter((line) => line.startsWith("ohmycms-") && !line.startsWith("ohmycms-studio-acc"))
    .map((line) => {
      const [name, ports, status] = line.split("\t");
      return { name, ports: ports ?? "", status: status ?? "" };
    });
}

/** docker compose を叩く。compose ファイルは呼び出し側が渡す。 */
export function compose(files, args, options = {}) {
  const fileArgs = files.flatMap((f) => ["-f", f]);
  return run("docker", ["compose", ...fileArgs, ...args], {
    timeoutMs: 900_000,
    ...options,
  });
}
