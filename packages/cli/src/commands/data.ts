import { createClient, type FilterObject, type Item } from "@ohmycms/sdk";
import {
  flagBoolean,
  flagJson,
  flagNumber,
  flagString,
  type ParsedArgs,
} from "../args.js";
import {
  adminCapabilities,
  buildCapabilities,
  collectionCapabilities,
} from "../capabilities.js";
import { requireAuth, requireHumanCredential, type Context } from "../context.js";
import { CliError, EXIT, usageError } from "../errors.js";
import { formatValue, note, print, printJson, printTable } from "../output.js";

function csvFlag(args: ParsedArgs, name: string): string[] | undefined {
  const raw = flagString(args, name);
  if (raw === undefined) return undefined;
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

export async function item(args: ParsedArgs, context: Context): Promise<number> {
  const sub = args.positionals[1];
  const target = args.positionals[2];

  if (sub === "list") {
    if (!target) throw usageError("コレクション名を指定してください。", "例: ohmycms item list articles");
    const wantsCount = flagBoolean(args, "count");
    const filter = flagJson(args, "filter") as FilterObject | undefined;
    requireAuth(context);

    const result = await context.client.items.list(target, {
      ...(filter !== undefined ? { filter } : {}),
      ...(csvFlag(args, "fields") ? { fields: csvFlag(args, "fields")! } : {}),
      ...(csvFlag(args, "sort") ? { sort: csvFlag(args, "sort")! } : {}),
      ...(flagNumber(args, "limit") !== undefined ? { limit: flagNumber(args, "limit")! } : {}),
      ...(flagNumber(args, "offset") !== undefined ? { offset: flagNumber(args, "offset")! } : {}),
      ...(flagNumber(args, "page") !== undefined ? { page: flagNumber(args, "page")! } : {}),
      ...(wantsCount ? { meta: ["total_count", "filter_count"] as const } : {}),
    });

    if (context.json) {
      printJson(result);
      return EXIT.OK;
    }
    if (result.data.length === 0) {
      print("該当するアイテムはありませんでした。");
      return EXIT.OK;
    }

    // 返ってきた列をそのまま表にする（コレクションごとに列が違うため）
    const columns = [...new Set(result.data.flatMap((row) => Object.keys(row)))];
    printTable(result.data, columns.map((name) => ({
      header: name,
      get: (row: Item) => formatValue(row[name]),
    })));
    if (result.meta) {
      print("");
      print(
        `表示 ${result.data.length} 件` +
          (result.meta.filter_count !== undefined ? ` / 絞り込み後 ${result.meta.filter_count} 件` : "") +
          (result.meta.total_count !== undefined ? ` / 全体 ${result.meta.total_count} 件` : ""),
      );
    }
    return EXIT.OK;
  }

  if (sub === "get") {
    const id = args.positionals[3];
    if (!target || !id) throw usageError("コレクション名と ID を指定してください。");
    requireAuth(context);
    const row = await context.client.items.get(target, id);
    printJson(row);
    return EXIT.OK;
  }

  if (sub === "create") {
    if (!target) throw usageError("コレクション名を指定してください。");
    const data = flagJson(args, "data");
    if (data === undefined) {
      throw usageError(
        "--data で登録する内容を指定してください。",
        `例: ohmycms item create ${target} --data '{"title":"はじめての記事"}'`,
      );
    }
    requireAuth(context);
    if (Array.isArray(data)) {
      const created = await context.client.items.createMany(target, data as Item[]);
      if (context.json) printJson(created);
      else print(`${created.length} 件登録しました。`);
      return EXIT.OK;
    }
    const created = await context.client.items.create(target, data as Item);
    if (context.json) printJson(created);
    else {
      print("登録しました。");
      printJson(created);
    }
    return EXIT.OK;
  }

  if (sub === "update") {
    const id = args.positionals[3];
    if (!target || !id) throw usageError("コレクション名と ID を指定してください。");
    const data = flagJson(args, "data");
    if (data === undefined) throw usageError("--data で更新する内容を指定してください。");
    requireAuth(context);
    const updated = await context.client.items.update(target, id, data as Item);
    if (context.json) printJson(updated);
    else {
      print("更新しました。");
      printJson(updated);
    }
    return EXIT.OK;
  }

  if (sub === "delete") {
    const id = args.positionals[3];
    if (!target || !id) throw usageError("コレクション名と ID を指定してください。");
    if (!flagBoolean(args, "yes")) {
      throw usageError("消す前に --yes を付けてください。");
    }
    requireAuth(context);
    await context.client.items.delete(target, id);
    if (context.json) printJson({ deleted: id });
    else print(`消しました: ${id}`);
    return EXIT.OK;
  }

  throw usageError(`未知のサブコマンドです: item ${sub}`, "ohmycms item --help を見てください。");
}

export async function user(args: ParsedArgs, context: Context): Promise<number> {
  const sub = args.positionals[1] ?? "list";
  if (sub !== "list") {
    throw usageError(`未知のサブコマンドです: user ${sub}`, "ohmycms user --help を見てください。");
  }
  requireAuth(context);

  const rows = await context.client.users.list();
  if (context.json) {
    printJson(rows);
    return EXIT.OK;
  }
  if (rows.length === 0) {
    print("ユーザーはいません。");
    return EXIT.OK;
  }
  printTable(rows, [
    { header: "メール", get: (row) => row.email },
    { header: "状態", get: (row) => row.status },
    { header: "ロール", get: (row) => formatValue(row.role) },
    { header: "provider", get: (row) => row.provider },
    { header: "ID", get: (row) => row.id },
  ]);
  return EXIT.OK;
}

/**
 * トークンの発行は**人間のセッションが必要**（API が requireHumanActor を通す）。
 * エージェントトークンでは発行できないので、セッションを別に受け取る。
 */
function sessionClient(context: Context) {
  // 優先順は resolveContext と同じ（フラグ > 環境変数 > 設定ファイル）。
  // login --dev-login でセッションを保存してあれば、そのまま使える。
  const sessionToken = requireHumanCredential(context);
  return createClient({ baseUrl: context.client.baseUrl, sessionToken });
}

export async function token(
  args: ParsedArgs,
  context: Context,
  argv: readonly string[],
): Promise<number> {
  const sub = args.positionals[1];

  if (sub === "create") {
    const name = flagString(args, "name");
    if (!name) {
      throw usageError("--name でトークンの名前を指定してください。", "例: ohmycms token create --name ci-bot");
    }
    const client = sessionClient(context);
    const adminCaps = adminCapabilities(args);
    const built = buildCapabilities(adminCaps, collectionCapabilities(argv));
    for (const warning of built.warnings) note(`注意: ${warning}`);
    const created = await client.agents.create({
      name,
      expires_in_days: flagNumber(args, "expires-in-days") ?? 30,
      ...(built.capabilities ? { capabilities: built.capabilities } : {}),
    });

    if (context.json) {
      printJson({ agent: created.agent, token: created.token });
    } else {
      print(`トークンを発行しました: ${created.agent.name}`);
      print(`ID:       ${created.agent.id}`);
      print(`有効期限: ${created.agent.expires_at}`);
      print(`管理 capability: ${adminCaps.length > 0 ? adminCaps.join(", ") : "なし（管理操作はできません）"}`);
      print("");
      print(created.token);
      note("↑ この値は二度と表示されません。安全な場所に保存してください。");
    }
    return EXIT.OK;
  }

  if (sub === "list") {
    const client = sessionClient(context);
    const rows = await client.agents.list();
    if (context.json) {
      printJson(rows);
      return EXIT.OK;
    }
    if (rows.length === 0) {
      print("発行済みのトークンはありません。");
      return EXIT.OK;
    }
    printTable(rows, [
      { header: "名前", get: (row) => row.name },
      { header: "ID", get: (row) => row.id },
      { header: "有効期限", get: (row) => row.expires_at },
      { header: "失効", get: (row) => (row.revoked_at ? "済" : "") },
    ]);
    note("（トークンの値は保存されていないため表示できません）");
    return EXIT.OK;
  }

  if (sub === "delete") {
    const id = args.positionals[2];
    if (!id) throw usageError("消すトークンの ID を指定してください。");
    const client = sessionClient(context);
    await client.agents.delete(id);
    if (context.json) printJson({ deleted: id });
    else print(`トークンを失効しました: ${id}`);
    return EXIT.OK;
  }

  throw usageError(`未知のサブコマンドです: token ${sub}`, "ohmycms token --help を見てください。");
}
