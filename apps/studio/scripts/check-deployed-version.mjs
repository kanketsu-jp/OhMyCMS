#!/usr/bin/env node
/**
 * デプロイ先の /api/health から、稼働中のビルド版を機械判定する。
 *
 * 使い方:
 *   node scripts/check-deployed-version.mjs <url> <expected-sha> [timeoutMs]
 *
 * 終了コード:
 *   0: version.commit が <expected-sha> と前方一致（一致）
 *   1: version.commit が値を持つが <expected-sha> と前方一致しない（不一致）
 *   2: version.commit が "unknown"（一致でも不一致でもない第3の状態）
 *   3: 実行時エラー（引数不足・fetch失敗・タイムアウト・HTTPエラー・JSON解釈不可）
 */

const [baseUrl, expectedSha, timeoutArg] = process.argv.slice(2);

function usageError(message) {
  console.error(`error: ${message}`);
  console.error("usage: node scripts/check-deployed-version.mjs <url> <expected-sha> [timeoutMs]");
  process.exit(3);
}

if (!baseUrl || !expectedSha) {
  usageError("url と expected-sha が必要です");
}

const timeoutMs =
  timeoutArg === undefined ? 10000 : Number.parseInt(timeoutArg, 10);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  usageError("timeoutMs は正の整数で指定してください");
}

function healthUrl(rawUrl) {
  try {
    return `${rawUrl.replace(/\/+$/, "")}/api/health`;
  } catch {
    usageError("url が不正です");
  }
}

function asRecord(value) {
  return value && typeof value === "object" ? value : null;
}

async function main() {
  const url = healthUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = asRecord(await response.json());
    const version = asRecord(payload?.version);
    const actual = version?.commit;
    if (typeof actual !== "string" || actual.length === 0) {
      throw new Error("version.commit が空、または文字列ではありません");
    }

    if (actual === "unknown") {
      console.error(
        `unknown: url=${url} expected=${expectedSha} actual=${actual} result=unknown`,
      );
      return 2;
    }

    if (actual.startsWith(expectedSha)) {
      console.log(
        `match: url=${url} expected=${expectedSha} actual=${actual} result=match`,
      );
      return 0;
    }

    console.error(
      `mismatch: url=${url} expected=${expectedSha} actual=${actual} result=mismatch`,
    );
    return 1;
  } catch (error) {
    const detail =
      error instanceof Error && error.name === "AbortError"
        ? `${timeoutMs}ms でタイムアウトしました`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(
      `error: url=${url} expected=${expectedSha} result=error detail=${detail}`,
    );
    return 3;
  } finally {
    clearTimeout(timer);
  }
}

process.exitCode = await main();
