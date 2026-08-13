import { createClient, type OhMyCmsClient } from "@ohmycms/sdk";
import type { ParsedArgs } from "./args.js";
import { flagBoolean, flagString } from "./args.js";
import { readConfig } from "./config.js";
import { CliError, EXIT } from "./errors.js";

export const DEFAULT_URL = "http://localhost:3000";

export type Resolved<T> = {
  value: T;
  /** どこから来た値か。`--help` の説明と実際の挙動を一致させるために持つ */
  source: "フラグ" | "環境変数" | "設定ファイル" | "既定値";
};

export type Context = {
  url: Resolved<string>;
  token: Resolved<string> | null;
  json: boolean;
  client: OhMyCmsClient;
};

/**
 * 接続先とトークンの決め方。**優先順は フラグ > 環境変数 > 設定ファイル > 既定値**。
 * （司令塔決定・2026-08-13。`--token` で一時的に上書きできないと使い物にならないため、
 * 当初仕様の「環境変数 → 設定ファイル → フラグ」から反転した）
 */
export async function resolveContext(args: ParsedArgs): Promise<Context> {
  const stored = await readConfig();

  const flagUrl = flagString(args, "url");
  const envUrl = process.env.OHMYCMS_URL;
  const url: Resolved<string> = flagUrl
    ? { value: flagUrl, source: "フラグ" }
    : envUrl
      ? { value: envUrl, source: "環境変数" }
      : stored.url
        ? { value: stored.url, source: "設定ファイル" }
        : { value: DEFAULT_URL, source: "既定値" };

  const flagToken = flagString(args, "token");
  const envToken = process.env.OHMYCMS_TOKEN;
  const token: Resolved<string> | null = flagToken
    ? { value: flagToken, source: "フラグ" }
    : envToken
      ? { value: envToken, source: "環境変数" }
      : stored.token
        ? { value: stored.token, source: "設定ファイル" }
        : null;

  return {
    url,
    token,
    json: flagBoolean(args, "json"),
    client: createClient({ baseUrl: url.value, token: token?.value }),
  };
}

/** トークンが要るコマンドの入口。無ければ何をすればいいかを日本語で言う */
export function requireToken(context: Context): string {
  if (!context.token) {
    throw new CliError(
      "トークンがありません。",
      EXIT.UNAUTHENTICATED,
      "ohmycms login --token <トークン> で保存するか、環境変数 OHMYCMS_TOKEN を設定してください。",
    );
  }
  return context.token.value;
}
