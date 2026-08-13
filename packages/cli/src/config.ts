import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CliError, EXIT } from "./errors.js";

export type StoredConfig = {
  url?: string;
  /** エージェントトークン（プログラムとしての認証）。**リポジトリ配下には絶対に置かない** */
  token?: string;
  /**
   * 人間セッションの生トークン（人としての認証）。
   * `login --dev-login` が保存する。エージェントトークンと違い capabilities の絞り込みが無いため、
   * 委任元ユーザーの権限がそのまま使える。
   */
  sessionToken?: string;
};

/**
 * 設定ファイルの置き場。
 * `XDG_CONFIG_HOME` を尊重し、無ければ `~/.config/ohmycms/config.json`。
 * **リポジトリ配下には決して書かない**（誤ってコミットされるため）。
 */
export function configPath(): string {
  const base =
    process.env.OHMYCMS_CONFIG_HOME ??
    process.env.XDG_CONFIG_HOME ??
    join(homedir(), ".config");
  return join(base, "ohmycms", "config.json");
}

export async function readConfig(): Promise<StoredConfig> {
  try {
    const raw = await readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as StoredConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (error instanceof SyntaxError) {
      throw new CliError(
        `設定ファイルが壊れています: ${configPath()}`,
        EXIT.GENERAL,
        "中身を確認するか、ファイルを削除して ohmycms login をやり直してください。",
      );
    }
    throw error;
  }
}

/**
 * 設定を書く。
 * **ディレクトリを 700、ファイルを 600** にする（ファイルだけ絞ってもディレクトリが覗ければ弱い）。
 */
export async function writeConfig(config: StoredConfig): Promise<string> {
  const path = configPath();
  const dir = dirname(path);

  await mkdir(dir, { recursive: true, mode: 0o700 });
  // すでにあった場合 mkdir の mode は効かないので明示的に絞り直す
  await chmod(dir, 0o700);

  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(path, 0o600);

  return path;
}

export async function clearConfig(): Promise<boolean> {
  try {
    await rm(configPath());
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** 実際のパーミッションを確認する（受入基準の実測用） */
export async function configPermissions(): Promise<{
  path: string;
  file: string | null;
  dir: string | null;
}> {
  const path = configPath();
  const mode = async (target: string): Promise<string | null> => {
    try {
      return (await stat(target)).mode.toString(8).slice(-3);
    } catch {
      return null;
    }
  };
  return { path, file: await mode(path), dir: await mode(dirname(path)) };
}
