import { usageError } from "./errors.js";

/**
 * 値を取らないフラグ。
 * これを持たないと `--sort -views`（降順ソート）で `-views` を値として拾えず、
 * 「未知のオプションです: -views」になってしまう（2026-08-13 に実際に踏んだ）。
 */
const BOOLEAN_FLAGS = new Set([
  "json",
  "help",
  "version",
  "admin",
  "required",
  "yes",
  "count",
  "system",
  "print-token",
  "keep-url",
  "all",
]);

export type ParsedArgs = {
  /** フラグを除いた位置引数（`collection` `list` など） */
  positionals: string[];
  flags: Map<string, string | boolean>;
};

/**
 * 最小限の引数パーサ。依存を増やさないため自前で持つ。
 *
 * 対応する形: `--key value` / `--key=value` / `--flag`(真偽) / `--no-flag`(偽) / `-h` / `--`
 * `--` 以降はすべて位置引数として扱う。
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  let passthrough = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;

    if (passthrough) {
      positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      passthrough = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags.set(body.slice(0, eq), body.slice(eq + 1));
        continue;
      }
      if (body.startsWith("no-")) {
        flags.set(body.slice(3), false);
        continue;
      }
      const next = argv[i + 1];
      // 値を取るフラグは、値が `-` で始まっていても拾う（`--sort -views` を通すため）。
      // ただし別のフラグ（`--` で始まる）は値と見なさない。
      const takesValue =
        !BOOLEAN_FLAGS.has(body) && next !== undefined && !next.startsWith("--");
      if (takesValue) {
        flags.set(body, next!);
        i += 1;
      } else {
        flags.set(body, true);
      }
      continue;
    }

    if (arg.startsWith("-") && arg.length > 1) {
      // 短縮形は help と version だけ受ける（増やすと曖昧になるため）
      if (arg === "-h") flags.set("help", true);
      else if (arg === "-v") flags.set("version", true);
      else throw usageError(`未知のオプションです: ${arg}`);
      continue;
    }

    positionals.push(arg);
  }

  return { positionals, flags };
}

export function flagString(
  args: ParsedArgs,
  name: string,
): string | undefined {
  const value = args.flags.get(name);
  if (value === undefined) return undefined;
  if (typeof value === "boolean") {
    throw usageError(`--${name} には値が必要です`);
  }
  return value;
}

export function flagBoolean(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true;
}

export function flagNumber(
  args: ParsedArgs,
  name: string,
): number | undefined {
  const raw = flagString(args, name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw usageError(`--${name} は数値で指定してください（受け取った値: ${raw}）`);
  }
  return parsed;
}

/** `--data '<json>'` のような JSON を受け取るフラグ */
export function flagJson(args: ParsedArgs, name: string): unknown {
  const raw = flagString(args, name);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw usageError(
      `--${name} は JSON として読めませんでした`,
      `シェルの引用符に注意してください。例: --${name} '{"title":"はじめての記事"}'`,
    );
  }
}
