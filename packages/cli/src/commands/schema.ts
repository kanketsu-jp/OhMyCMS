import { writeFile } from "node:fs/promises";
import type { FieldSpec, FieldType } from "@ohmycms/sdk";
import {
  flagBoolean,
  flagNumber,
  flagString,
  type ParsedArgs,
} from "../args.js";
import { requireToken, type Context } from "../context.js";
import { EXIT, usageError } from "../errors.js";
import { formatValue, print, printJson, printTable } from "../output.js";

const FIELD_TYPES: readonly FieldType[] = [
  "string",
  "integer",
  "bigInteger",
  "decimal",
  "float",
  "boolean",
  "json",
  "uuid",
  "date",
  "time",
  "dateTime",
];

function assertFieldType(value: string): FieldType {
  if (!(FIELD_TYPES as readonly string[]).includes(value)) {
    throw usageError(
      `未対応の型です: ${value}`,
      `使える型: ${FIELD_TYPES.join(" / ")}`,
    );
  }
  return value as FieldType;
}

/** `--field title:string` を繰り返し指定できるようにする */
function collectFieldFlags(argv: readonly string[]): FieldSpec[] {
  const specs: FieldSpec[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    let raw: string | undefined;
    if (arg === "--field") raw = argv[i + 1];
    else if (arg.startsWith("--field=")) raw = arg.slice("--field=".length);
    else continue;

    if (!raw || raw.startsWith("-")) {
      throw usageError("--field は <名前>:<型> の形で指定してください（例: --field title:string）");
    }
    const separator = raw.lastIndexOf(":");
    if (separator <= 0) {
      throw usageError(`--field の書き方が違います: ${raw}`, "例: --field title:string");
    }
    specs.push({
      field: raw.slice(0, separator),
      type: assertFieldType(raw.slice(separator + 1)),
    });
  }
  return specs;
}

export async function collection(
  args: ParsedArgs,
  context: Context,
  argv: readonly string[],
): Promise<number> {
  const sub = args.positionals[1];

  if (sub === "list" || sub === undefined) {
    requireToken(context);
    const rows = await context.client.collections.list({
      system: flagBoolean(args, "system"),
    });
    if (context.json) {
      printJson(rows);
      return EXIT.OK;
    }
    if (rows.length === 0) {
      print("コレクションはまだありません。");
      return EXIT.OK;
    }
    printTable(rows, [
      { header: "コレクション", get: (row) => row.collection },
      { header: "列数", get: (row) => String(row.schema?.columns.length ?? 0) },
      { header: "メモ", get: (row) => formatValue(row.meta?.note) },
    ]);
    return EXIT.OK;
  }

  if (sub === "create") {
    const name = args.positionals[2];
    if (!name) throw usageError("コレクション名を指定してください。", "例: ohmycms collection create articles");
    requireToken(context);

    const primaryKey = flagString(args, "primary-key") ?? "id";
    const fields: FieldSpec[] = [
      { field: primaryKey, type: "uuid", schema: { is_primary_key: true } },
      ...collectFieldFlags(argv),
    ];

    const created = await context.client.collections.create({ collection: name, fields });
    if (context.json) printJson(created);
    else {
      print(`コレクションを作りました: ${created.collection}`);
      print(`列: ${created.schema?.columns.map((c) => `${c.name}(${c.data_type})`).join(", ") ?? "-"}`);
    }
    return EXIT.OK;
  }

  if (sub === "delete") {
    const name = args.positionals[2];
    if (!name) throw usageError("コレクション名を指定してください。");
    if (!flagBoolean(args, "yes")) {
      throw usageError(
        `${name} を消すとテーブルごと消えます。`,
        "本当に消してよければ --yes を付けてください。",
      );
    }
    requireToken(context);
    const result = await context.client.collections.delete(name);
    if (context.json) printJson(result);
    else print(`コレクションを消しました: ${result.collection}`);
    return EXIT.OK;
  }

  throw usageError(`未知のサブコマンドです: collection ${sub}`, "ohmycms collection --help を見てください。");
}

export async function field(args: ParsedArgs, context: Context): Promise<number> {
  const sub = args.positionals[1];

  if (sub === "list") {
    const target = args.positionals[2];
    if (!target) throw usageError("コレクション名を指定してください。");
    requireToken(context);
    const rows = await context.client.fields.list(target);
    if (context.json) {
      printJson(rows);
      return EXIT.OK;
    }
    printTable(rows, [
      { header: "フィールド", get: (row) => row.field },
      { header: "型", get: (row) => row.type },
      { header: "NULL可", get: (row) => (row.schema?.is_nullable ? "はい" : "いいえ") },
      { header: "主キー", get: (row) => (row.schema?.is_primary_key ? "はい" : "") },
    ]);
    return EXIT.OK;
  }

  if (sub === "add") {
    const target = args.positionals[2];
    const name = args.positionals[3];
    if (!target || !name) {
      throw usageError(
        "コレクション名とフィールド名を指定してください。",
        "例: ohmycms field add articles title --type string",
      );
    }
    const type = flagString(args, "type");
    if (!type) throw usageError("--type を指定してください。", `使える型: ${FIELD_TYPES.join(" / ")}`);
    assertFieldType(type);
    requireToken(context);

    const maxLength = flagNumber(args, "max-length");
    const spec: FieldSpec = {
      field: name,
      type: assertFieldType(type),
      schema: {
        ...(flagBoolean(args, "required") ? { is_nullable: false } : {}),
        ...(maxLength !== undefined ? { max_length: maxLength } : {}),
      },
    };

    const created = await context.client.fields.create(target, spec);
    if (context.json) printJson(created);
    else print(`フィールドを追加しました: ${created.collection}.${created.field} (${created.type})`);
    return EXIT.OK;
  }

  throw usageError(`未知のサブコマンドです: field ${sub}`, "ohmycms field --help を見てください。");
}

export async function schema(args: ParsedArgs, context: Context): Promise<number> {
  const sub = args.positionals[1] ?? "snapshot";
  if (sub !== "snapshot") {
    throw usageError(`未知のサブコマンドです: schema ${sub}`, "ohmycms schema --help を見てください。");
  }
  requireToken(context);

  const includeSystem = flagBoolean(args, "system");
  const [collections, fields, relations] = await Promise.all([
    context.client.collections.list({ system: includeSystem }),
    context.client.fields.listAll(),
    context.client.relations.list(),
  ]);

  const names = new Set(collections.map((row) => row.collection));
  const snapshot = {
    generated_at: new Date().toISOString(),
    url: context.client.baseUrl,
    collections,
    // fields は全コレクション分返るので、対象のものだけに絞る
    fields: fields.filter((row) => names.has(row.collection)),
    relations: relations.filter((row) => names.has(row.many_collection)),
  };

  const out = flagString(args, "out");
  if (out) {
    await writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    if (context.json) printJson({ written: out, collections: collections.length });
    else print(`スキーマを書き出しました: ${out} (コレクション ${collections.length} 件)`);
    return EXIT.OK;
  }

  printJson(snapshot);
  return EXIT.OK;
}
