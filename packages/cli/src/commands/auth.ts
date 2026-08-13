import { ALL_ADMIN_CAPABILITIES, createClient } from "@ohmycms/sdk";
import { flagBoolean, flagNumber, flagString, type ParsedArgs } from "../args.js";
import {
  adminCapabilities,
  buildCapabilities,
  collectionCapabilities,
} from "../capabilities.js";
import { clearConfig, configPermissions, readConfig, writeConfig } from "../config.js";
import { requireToken, type Context } from "../context.js";
import { CliError, EXIT, usageError } from "../errors.js";
import { note, print, printJson } from "../output.js";

export async function health(context: Context): Promise<number> {
  const result = await context.client.health();
  if (context.json) {
    printJson(result);
  } else {
    print(`接続先: ${context.client.baseUrl}`);
    print(`状態:   ${result.status}`);
    print(`DB:     ${result.db}`);
  }
  return EXIT.OK;
}

export async function whoami(context: Context): Promise<number> {
  requireToken(context);
  const actor = await context.client.auth.me();

  if (context.json) {
    printJson({ url: context.client.baseUrl, tokenSource: context.token?.source, actor });
    return EXIT.OK;
  }

  print(`接続先:         ${context.client.baseUrl}`);
  print(`トークンの出所: ${context.token?.source}`);
  if (actor.type === "human") {
    print(`種別:           人間 (セッション)`);
    print(`ユーザーID:     ${actor.userId}`);
    print(`メール:         ${actor.email}`);
    print(`ロール:         ${actor.role ?? "-"}`);
  } else {
    print(`種別:           エージェント`);
    print(`エージェントID: ${actor.agentId}`);
    print(`名前:           ${actor.name}`);
    print(`委任元:         ${actor.onBehalfOf}`);
    print(`capabilities:   ${actor.capabilities === null ? "制限なし" : JSON.stringify(actor.capabilities)}`);
  }
  return EXIT.OK;
}

export async function login(
  args: ParsedArgs,
  context: Context,
  argv: readonly string[],
): Promise<number> {
  const token = flagString(args, "token");
  const devLoginEmail = flagString(args, "dev-login");

  if (token && devLoginEmail) {
    throw usageError("--token と --dev-login は同時に指定できません。");
  }
  if (!token && !devLoginEmail) {
    throw usageError(
      "保存するトークンがありません。",
      "ohmycms login --token <トークン> か、開発中なら ohmycms login --dev-login <メールアドレス> を使ってください。",
    );
  }

  const stored = await readConfig();
  const url = flagString(args, "url") ?? context.url.value;

  if (token) {
    // 保存する前に本当に使えるトークンか確かめる（壊れた設定を残さない）
    const probe = createClient({ baseUrl: url, token });
    const actor = await probe.auth.me();
    const path = await writeConfig({ ...stored, url, token });
    const perms = await configPermissions();

    if (context.json) {
      printJson({ saved: path, url, actor, permissions: { dir: perms.dir, file: perms.file } });
    } else {
      note(`トークンを確認しました (${actor.type === "agent" ? `エージェント: ${actor.name}` : `ユーザー: ${actor.email}`})`);
      print(`保存しました: ${path}`);
      print(`接続先:       ${url}`);
      print(`権限:         ディレクトリ ${perms.dir} / ファイル ${perms.file}`);
    }
    return EXIT.OK;
  }

  // --dev-login: 開発専用。セッションを取り、その場でトークンを発行して保存する
  const anon = createClient({ baseUrl: url });
  const admin = flagBoolean(args, "admin");
  let session: Awaited<ReturnType<typeof anon.auth.devLogin>>;
  try {
    session = await anon.auth.devLogin(devLoginEmail!, { admin });
  } catch (error) {
    throw new CliError(
      "開発用ログインが使えませんでした。",
      EXIT.GENERAL,
      "サーバ側で ALLOW_DEV_LOGIN=true かつ NODE_ENV が production でないことを確認してください。" +
        `（元のエラー: ${error instanceof Error ? error.message : String(error)}）`,
    );
  }
  if (!session.sessionToken) {
    throw new CliError(
      "開発用ログインはできましたが、セッションを取り出せませんでした。",
      EXIT.GENERAL,
    );
  }

  const sessionClient = createClient({ baseUrl: url, sessionToken: session.sessionToken });
  // --admin を付けたなら「管理もできるトークン」が欲しいはずなので、
  // admin capability を既定で全部付ける（API は明示しないと管理操作を全部拒否する）。
  const adminCaps = adminCapabilities(args, admin ? ALL_ADMIN_CAPABILITIES : []);
  const built = buildCapabilities(adminCaps, collectionCapabilities(argv));
  for (const warning of built.warnings) note(`注意: ${warning}`);
  const created = await sessionClient.agents.create({
    name: flagString(args, "name") ?? "ohmycms-cli",
    expires_in_days: flagNumber(args, "expires-in-days") ?? 30,
    ...(built.capabilities ? { capabilities: built.capabilities } : {}),
  });

  const path = await writeConfig({ ...stored, url, token: created.token });
  const perms = await configPermissions();

  if (context.json) {
    printJson({
      saved: path,
      url,
      agent: created.agent,
      permissions: { dir: perms.dir, file: perms.file },
      ...(flagBoolean(args, "print-token") ? { token: created.token } : {}),
    });
  } else {
    note("開発用ログインを使いました。本番では絶対に有効にしないでください。");
    print(`保存しました: ${path}`);
    print(`接続先:       ${url}`);
    print(`トークン名:   ${created.agent.name}`);
    print(`有効期限:     ${created.agent.expires_at}`);
    print(`管理 capability: ${adminCaps.length > 0 ? adminCaps.join(", ") : "なし（管理操作はできません）"}`);
    print(`権限:         ディレクトリ ${perms.dir} / ファイル ${perms.file}`);
    if (flagBoolean(args, "print-token")) {
      print("");
      print(`トークン: ${created.token}`);
      note("↑ この値は二度と表示されません。");
    }
  }
  return EXIT.OK;
}

export async function logout(args: ParsedArgs, context: Context): Promise<number> {
  const keepUrl = flagBoolean(args, "keep-url");

  if (keepUrl) {
    const stored = await readConfig();
    if (!stored.token) {
      note("保存されたトークンはありませんでした。");
      return EXIT.OK;
    }
    const { token: _discarded, ...rest } = stored;
    const path = await writeConfig(rest);
    if (context.json) printJson({ cleared: "token", path });
    else print(`トークンを消しました（接続先は残しています）: ${path}`);
    return EXIT.OK;
  }

  const removed = await clearConfig();
  if (context.json) printJson({ removed });
  else print(removed ? "設定ファイルを削除しました。" : "設定ファイルはありませんでした。");
  return EXIT.OK;
}
