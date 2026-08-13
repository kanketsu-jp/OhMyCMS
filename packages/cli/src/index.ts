import { isOhMyCmsError } from "@ohmycms/sdk";
import { flagBoolean, parseArgs } from "./args.js";
import { health, login, logout, whoami } from "./commands/auth.js";
import { item, token, user } from "./commands/data.js";
import { collection, field, schema } from "./commands/schema.js";
import { resolveContext } from "./context.js";
import { CliError, EXIT, type ExitCode } from "./errors.js";
import { printHelp, printSubcommandHelp, VERSION } from "./help.js";
import { assertKnownFlags, knownCommands } from "./known-flags.js";
import { note, print } from "./output.js";

/** SDK の例外を CLI の終了コードへ写す */
function exitCodeFor(status: number): ExitCode {
  switch (status) {
    case 0:
      return EXIT.UNREACHABLE;
    case 401:
      return EXIT.UNAUTHENTICATED;
    case 403:
      return EXIT.FORBIDDEN;
    case 404:
      return EXIT.NOT_FOUND;
    default:
      return EXIT.GENERAL;
  }
}

/** サーバのエラーコードごとの「次に何をすればいいか」。message は API 側が日本語で返す */
const HINTS: Record<string, string> = {
  UNAUTHENTICATED:
    "トークンが送られていません。ohmycms login --token <トークン> か環境変数 OHMYCMS_TOKEN を設定してください。",
  INVALID_AGENT_TOKEN:
    "トークンが無効・失効・期限切れです。ohmycms token create で発行し直してください。",
  INVALID_BEARER_TOKEN: "Authorization ヘッダの形式が不正です。トークンの値を確認してください。",
  INVALID_SESSION: "セッションが切れています。--session-token を取り直してください。",
  ADMIN_ACCESS_REQUIRED:
    "この操作には管理者権限が要ります。委任元ユーザーが管理者ポリシーを持っているか確認してください。",
  CAPABILITY_DENIED:
    "このトークンには管理操作の capability がありません。ohmycms token create --admin-capability … で発行し直すか、" +
    "開発中なら ohmycms login --dev-login <メールアドレス> で人としてログインしてください（capabilities の絞り込みがありません）。",
  PERMISSION_DENIED:
    "このコレクションへの権限がありません。管理画面の「ポリシー」で権限を付けてください。",
  FIELD_FORBIDDEN: "権限で許されていない列を指定しています。--fields を見直してください。",
  HUMAN_AUTH_REQUIRED:
    "この操作は人間のセッションでしか実行できません。--session-token を渡してください。",
  SYSTEM_COLLECTION_FORBIDDEN:
    "システムテーブルは item コマンドから触れません。専用のコマンド（user list など）を使ってください。",
  COLLECTION_NOT_FOUND: "コレクション名を確認してください。ohmycms collection list で一覧が見られます。",
  ITEM_NOT_FOUND:
    "ID が違うか、権限で見えない行です（権限で隠れている行も 404 になります）。",
  UNSUPPORTED_OPERATOR: "--filter で使える演算子は _eq / _neq / _in / _gte / _contains などです。",
};

async function run(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const command = args.positionals[0];

  if (flagBoolean(args, "version") && !command) {
    print(VERSION);
    return EXIT.OK;
  }
  if (!command || flagBoolean(args, "help")) {
    if (command && printSubcommandHelp(command)) return EXIT.OK;
    printHelp();
    // コマンドが無いのにフラグだけ渡された場合（`ohmycms --badflag`）は
    // ヘルプを出したうえで「引数の誤り」を返す。0 を返すと打ち間違いに気づけない。
    return !command && args.flags.size > 0 && !flagBoolean(args, "help")
      ? EXIT.USAGE
      : EXIT.OK;
  }

  if (!knownCommands().includes(command)) {
    throw new CliError(
      `未知のコマンドです: ${command}`,
      EXIT.USAGE,
      "ohmycms --help で使えるコマンドが見られます。",
    );
  }
  // 打ち間違えたフラグを黙って無視しない（--jsno で JSON 出力にならない事故を防ぐ）
  assertKnownFlags(command, args);

  const context = await resolveContext(args);

  switch (command) {
    case "health":
      return health(context);
    case "whoami":
      return whoami(context);
    case "login":
      return login(args, context);
    case "logout":
      return logout(args, context);
    case "collection":
      return collection(args, context, argv);
    case "field":
      return field(args, context);
    case "item":
      return item(args, context);
    case "user":
      return user(args, context);
    case "token":
      return token(args, context, argv);
    case "schema":
      return schema(args, context);
    default:
      throw new CliError(
        `未知のコマンドです: ${command}`,
        EXIT.USAGE,
        "ohmycms --help で使えるコマンドが見られます。",
      );
  }
}

async function main(): Promise<void> {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    if (error instanceof CliError) {
      note(`エラー: ${error.message}`);
      if (error.hint) note(`  → ${error.hint}`);
      process.exitCode = error.exitCode;
      return;
    }

    if (isOhMyCmsError(error)) {
      // message は API が日本語で返している。code ごとの案内を足す
      note(`エラー: ${error.message}（${error.code} / HTTP ${error.status || "接続失敗"}）`);
      const hint = HINTS[error.code];
      if (hint) note(`  → ${hint}`);
      if (error.isNetworkError) {
        note(`  → 接続先を確認してください: ${error.detail.url}`);
      }
      process.exitCode = exitCodeFor(error.status);
      return;
    }

    note(`予期しないエラー: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = EXIT.GENERAL;
  }
}

void main();
