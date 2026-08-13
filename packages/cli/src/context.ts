import { createClient, type OhMyCmsClient } from "@ohmycms/sdk";
import type { ParsedArgs } from "./args.js";
import { flagBoolean, flagString } from "./args.js";
import { readConfig } from "./config.js";
import { CliError, EXIT } from "./errors.js";

// 既定は Studio の開発ポート。3000 は Next.js の既定で他プロジェクトと必ず衝突するため
// 使わない（knowledge/decisions/port-allocation.md）。
export const DEFAULT_URL = "http://localhost:3102";

export type Resolved<T> = {
  value: T;
  /** どこから来た値か。`--help` の説明と実際の挙動を一致させるために持つ */
  source: "フラグ" | "環境変数" | "設定ファイル" | "既定値";
};

/**
 * 認証の種類。OhMyCMS は二階建て認証なので、CLI もそのまま2つ持つ。
 * - `agent`  … `Authorization: Bearer`。プログラムとしての認証。capabilities で絞られる
 * - `human`  … `Cookie: session`。人としての認証。capabilities の絞り込みは無い
 */
export type Credential =
  | { kind: "agent"; token: string; source: Resolved<string>["source"] }
  | { kind: "human"; sessionToken: string; source: Resolved<string>["source"] };

export type Context = {
  url: Resolved<string>;
  credential: Credential | null;
  json: boolean;
  client: OhMyCmsClient;
};

/**
 * 接続先と認証情報の決め方。**優先順は フラグ > 環境変数 > 設定ファイル > 既定値**。
 * （司令塔決定・2026-08-13。`--token` で一時的に上書きできないと使い物にならないため、
 * 当初仕様の「環境変数 → 設定ファイル → フラグ」から反転した）
 *
 * エージェントトークンと人間セッションの両方があるときは**エージェントを優先**する
 * （API 側が Bearer を先に見るので、そこに合わせないと表示と実挙動がずれる）。
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
  const flagSession = flagString(args, "session-token");
  const envSession = process.env.OHMYCMS_SESSION_TOKEN;

  let credential: Credential | null = null;
  if (flagToken) credential = { kind: "agent", token: flagToken, source: "フラグ" };
  else if (flagSession) credential = { kind: "human", sessionToken: flagSession, source: "フラグ" };
  else if (envToken) credential = { kind: "agent", token: envToken, source: "環境変数" };
  else if (envSession) credential = { kind: "human", sessionToken: envSession, source: "環境変数" };
  else if (stored.token) credential = { kind: "agent", token: stored.token, source: "設定ファイル" };
  else if (stored.sessionToken) {
    credential = { kind: "human", sessionToken: stored.sessionToken, source: "設定ファイル" };
  }

  return {
    url,
    credential,
    json: flagBoolean(args, "json"),
    client: createClient({
      baseUrl: url.value,
      ...(credential?.kind === "agent" ? { token: credential.token } : {}),
      ...(credential?.kind === "human" ? { sessionToken: credential.sessionToken } : {}),
    }),
  };
}

/** 認証が要るコマンドの入口。無ければ何をすればいいかを日本語で言う */
export function requireAuth(context: Context): Credential {
  if (!context.credential) {
    throw new CliError(
      "認証情報がありません。",
      EXIT.UNAUTHENTICATED,
      "ohmycms login --token <トークン> で保存するか、開発中なら ohmycms login --dev-login <メールアドレス> を使ってください。",
    );
  }
  return context.credential;
}

/**
 * **人間のセッションが必須**なコマンド（トークンの発行・一覧・失効）の入口。
 * API が `requireHumanActor` を通すため、エージェントトークンでは 403 になる。
 */
export function requireHumanCredential(context: Context): string {
  const credential = context.credential;
  if (credential?.kind === "human") return credential.sessionToken;

  throw new CliError(
    "この操作には人間のセッションが必要です（エージェントトークンでは実行できません）。",
    EXIT.UNAUTHENTICATED,
    credential
      ? "いまはエージェントトークンで認証しています。開発中なら ohmycms login --dev-login <メールアドレス> でセッションに切り替えるか、--session-token <生トークン> を渡してください。"
      : "開発中なら ohmycms login --dev-login <メールアドレス>、それ以外はブラウザの session クッキーの値を --session-token で渡してください。",
  );
}
