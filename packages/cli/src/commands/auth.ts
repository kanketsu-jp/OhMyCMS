import { createClient } from "@ohmycms/sdk";
import { flagBoolean, flagString, type ParsedArgs } from "../args.js";
import { clearConfig, configPermissions, readConfig, writeConfig } from "../config.js";
import { requireAuth, type Context } from "../context.js";
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
  const credential = requireAuth(context);
  const actor = await context.client.auth.me();

  if (context.json) {
    printJson({
      url: context.client.baseUrl,
      credentialKind: credential.kind,
      credentialSource: credential.source,
      actor,
    });
    return EXIT.OK;
  }

  print(`接続先:         ${context.client.baseUrl}`);
  print(`認証の出所:     ${credential.source}`);
  if (actor.type === "human") {
    print(`種別:           人間（セッション）`);
    print(`ユーザーID:     ${actor.userId}`);
    print(`メール:         ${actor.email}`);
    print(`ロール:         ${actor.role ?? "-"}`);
    print("");
    print("capabilities による絞り込みはありません（このユーザーの権限がそのまま使えます）。");
  } else {
    print(`種別:           エージェント（トークン）`);
    print(`エージェントID: ${actor.agentId}`);
    print(`名前:           ${actor.name}`);
    print(`委任元:         ${actor.onBehalfOf}`);
    print(`capabilities:   ${actor.capabilities === null ? "制限なし（委任元の権限をそのまま継承／管理操作は不可）" : JSON.stringify(actor.capabilities)}`);
  }
  return EXIT.OK;
}

export async function login(args: ParsedArgs, context: Context): Promise<number> {
  const token = flagString(args, "token");
  const devLoginEmail = flagString(args, "dev-login");

  if (token && devLoginEmail) {
    throw usageError("--token と --dev-login は同時に指定できません。");
  }
  if (!token && !devLoginEmail) {
    throw usageError(
      "保存する認証情報がありません。",
      "ohmycms login --token <トークン> か、開発中なら ohmycms login --dev-login <メールアドレス> を使ってください。",
    );
  }

  const stored = await readConfig();
  const url = flagString(args, "url") ?? context.url.value;

  /* ---------------- エージェントトークンを預かる（本番も含む通常の使い方） ---------------- */
  if (token) {
    // 保存する前に本当に使えるトークンか確かめる（壊れた設定を残さない）
    const probe = createClient({ baseUrl: url, token });
    const actor = await probe.auth.me();
    // 別の認証が残っていると、どちらで動いているのか分からなくなる
    const { sessionToken: _dropped, ...rest } = stored;
    const path = await writeConfig({ ...rest, url, token });
    const perms = await configPermissions();

    if (context.json) {
      printJson({ saved: path, url, kind: "agent", actor, permissions: { dir: perms.dir, file: perms.file } });
    } else {
      note(
        `トークンを確認しました（${actor.type === "agent" ? `エージェント: ${actor.name}` : `ユーザー: ${actor.email}`}）`,
      );
      print(`保存しました: ${path}`);
      print(`接続先:       ${url}`);
      print(`権限:         ディレクトリ ${perms.dir} / ファイル ${perms.file}`);
      if (actor.type === "agent" && actor.capabilities !== null) {
        note(
          "このトークンには capabilities が設定されています。" +
            "ohmycms whoami で範囲を確認できます。",
        );
      }
    }
    return EXIT.OK;
  }

  /* ---------------- 開発用: 人間としてログインし、セッションを預かる ---------------- */
  //
  // 🚨 ここで**エージェントトークンを発行しない**（2026-08-13 の設計判断）。
  //   以前は login --dev-login --admin がトークンを発行していたが、API は
  //   「capabilities を一度でも指定すると collections を明示しない限り items が全部 403」
  //   という fail-closed の作りなので、「テーブルは作れるが行は1件も読み書きできない」
  //   トークンが出来ていた。人間としてログインするなら capabilities の概念に触れずに済む。
  //   絞ったトークンが要るときは、ログイン後に `ohmycms token create` で明示的に作る。
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

  const { token: _discarded, ...rest } = stored;
  const path = await writeConfig({ ...rest, url, sessionToken: session.sessionToken });
  const perms = await configPermissions();

  if (context.json) {
    printJson({
      saved: path,
      url,
      kind: "human",
      actor: session.actor,
      permissions: { dir: perms.dir, file: perms.file },
    });
  } else {
    note("開発用ログインを使いました。本番では絶対に有効にしないでください。");
    print(`保存しました: ${path}`);
    print(`接続先:       ${url}`);
    print(`種別:         人間（セッション）`);
    print(
      `メール:       ${session.actor.type === "human" ? session.actor.email : devLoginEmail}` +
        `${admin ? "（管理者ポリシー付き）" : ""}`,
    );
    print(`権限:         ディレクトリ ${perms.dir} / ファイル ${perms.file}`);
    print("");
    print("capabilities の絞り込みはありません。絞ったトークンが要るときは:");
    print("  ohmycms token create --name <名前> --admin-capability … --collection-capability …");
  }
  return EXIT.OK;
}

export async function logout(args: ParsedArgs, context: Context): Promise<number> {
  const keepUrl = flagBoolean(args, "keep-url");

  if (keepUrl) {
    const stored = await readConfig();
    if (!stored.token && !stored.sessionToken) {
      note("保存された認証情報はありませんでした。");
      return EXIT.OK;
    }
    const { token: _t, sessionToken: _s, ...rest } = stored;
    const path = await writeConfig(rest);
    if (context.json) printJson({ cleared: "credentials", path });
    else print(`認証情報を消しました（接続先は残しています）: ${path}`);
    return EXIT.OK;
  }

  const removed = await clearConfig();
  if (context.json) printJson({ removed });
  else print(removed ? "設定ファイルを削除しました。" : "設定ファイルはありませんでした。");
  return EXIT.OK;
}
