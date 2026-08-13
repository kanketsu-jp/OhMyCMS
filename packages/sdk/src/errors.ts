/**
 * API が返したエラー本文。
 * 実測: `{"error":{"code":"PERMISSION_DENIED","message":"権限がありません"}}`
 * （apps/studio/lib/schema/api.ts の errorResponse）
 */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== "object") return false;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return false;
  return typeof (error as { code?: unknown }).code === "string";
}

/**
 * HTTP が 2xx でなかったときに投げる例外。
 *
 * 呼び出し側が 401 / 403 / 404 を区別できることが要件なので、
 * `status` は必ず持たせる（本文が JSON でない 404 空ボディでも 404 が入る）。
 */
export class OhMyCmsError extends Error {
  override readonly name = "OhMyCmsError";

  constructor(
    /** HTTP ステータス。ネットワーク到達前の失敗は 0 */
    readonly status: number,
    /** API のエラーコード。取れなかったときは "HTTP_ERROR" / "NETWORK_ERROR" */
    readonly code: string,
    message: string,
    readonly detail: {
      method: string;
      url: string;
      /** パース済みの本文（JSON でなければ文字列。空ボディなら null） */
      body: unknown;
      cause?: unknown;
    },
  ) {
    super(message);
  }

  /** 認証が無い・トークンが無効 */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** 認証は通ったが権限が無い */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** 対象が無い（権限で見えていない場合もここに落ちる） */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** サーバまで届かなかった（DNS / 接続拒否 / タイムアウト） */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function isOhMyCmsError(value: unknown): value is OhMyCmsError {
  return value instanceof OhMyCmsError;
}
