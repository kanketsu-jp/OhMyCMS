/**
 * 終了コード。`--help` にも同じ表を出す。
 * 0 以外を返すことが受入基準なので、握りつぶさないこと。
 */
export const EXIT = {
  OK: 0,
  /** 一般エラー（サーバの 400/500・想定外の例外） */
  GENERAL: 1,
  /** 引数の誤り（未知のコマンド・必須フラグ不足） */
  USAGE: 2,
  /** 認証されていない（401。トークンが無い・無効・期限切れ） */
  UNAUTHENTICATED: 3,
  /** 権限が足りない（403） */
  FORBIDDEN: 4,
  /** 対象が見つからない（404） */
  NOT_FOUND: 5,
  /** サーバへ接続できない（DNS / 接続拒否 / タイムアウト） */
  UNREACHABLE: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** CLI 自身が投げるエラー。message は必ず日本語で書く */
export class CliError extends Error {
  override readonly name = "CliError";

  constructor(
    message: string,
    readonly exitCode: ExitCode = EXIT.GENERAL,
    /** 次に何をすればいいかの1行。あれば message の下に出す */
    readonly hint?: string,
  ) {
    super(message);
  }
}

export function usageError(message: string, hint?: string): CliError {
  return new CliError(message, EXIT.USAGE, hint);
}
