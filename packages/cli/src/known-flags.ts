import type { ParsedArgs } from "./args.js";
import { usageError } from "./errors.js";

/** どのコマンドでも使える */
const GLOBAL_FLAGS = ["url", "token", "json", "help", "version"] as const;

/**
 * コマンドごとに受け付けるフラグ。
 * ここに無いフラグは**エラーにする**。黙って無視すると、`--jsno` のような打ち間違いで
 * 機械向け出力のつもりが人間向け出力になり、呼び出し側のパースが静かに壊れるため。
 */
const COMMAND_FLAGS: Record<string, readonly string[]> = {
  health: [],
  whoami: [],
  login: ["dev-login", "admin", "name", "expires-in-days", "print-token", "admin-capability", "collection-capability"],
  logout: ["keep-url"],
  collection: ["system", "field", "primary-key", "yes"],
  field: ["type", "required", "max-length"],
  item: ["filter", "fields", "sort", "limit", "offset", "page", "count", "data", "yes"],
  user: [],
  token: ["name", "expires-in-days", "session-token", "admin-capability", "collection-capability"],
  schema: ["out", "system"],
};

export function knownCommands(): string[] {
  return Object.keys(COMMAND_FLAGS);
}

export function assertKnownFlags(command: string, args: ParsedArgs): void {
  const allowed = new Set<string>([...GLOBAL_FLAGS, ...(COMMAND_FLAGS[command] ?? [])]);
  for (const name of args.flags.keys()) {
    if (!allowed.has(name)) {
      const candidates = [...allowed].filter(
        (candidate) => candidate.startsWith(name.slice(0, 2)) || name.startsWith(candidate.slice(0, 2)),
      );
      throw usageError(
        `${command} では使えないオプションです: --${name}`,
        candidates.length > 0
          ? `もしかして: ${candidates.map((c) => `--${c}`).join(" / ")}（ohmycms ${command} --help も見てください）`
          : `ohmycms ${command} --help で使えるオプションが見られます。`,
      );
    }
  }
}
