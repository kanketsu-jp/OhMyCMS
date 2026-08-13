export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * PostgreSQL が返した SQLSTATE を、そのまま使える文言の ApiError へ翻訳する。
 *
 * 🚨 **なぜ要るか。「先に存在を確かめてから書く」だけでは、同時に2回来たときに素通りする。**
 *
 * DDL の入口はどれも「`tableExists` / `columnExists` で確かめる → `ALTER` / `DROP` する」形をしている。
 * ところが**二重クリックの実体は連続ではなく並行**で、2本が同時に確認を通り、両方が書きに行く。
 * 先着が成功し、後着は PostgreSQL に弾かれる。**データは壊れない**（実測済み）が、
 * 弾かれ方が生の DB エラーなので `errorResponse` の受け皿まで落ちて
 * **「サーバ内部でエラーが発生しました」**になっていた。
 * 利用者から見れば「もう作られている」だけなのに、障害が起きたように見える。
 *
 * 🚨 **これは競合の"修正"ではない。** 直しているのは**文言だけ**で、
 * 弾いているのは相変わらず PostgreSQL 側の制約である。
 * コレクション作成（`COLLECTION_EXISTS`）だけはアプリが意図して守っているので、意味が違う。
 *
 * 対象の SQLSTATE は https://www.postgresql.org/docs/17/errcodes-appendix.html
 */
const PG_STATE_TO_API: Record<string, { status: number; code: string; message: string }> = {
  // 42701 duplicate_column — 同じ列を2回足そうとした
  "42701": { status: 409, code: "FIELD_EXISTS", message: "フィールドはもう作られています" },
  // 42P07 duplicate_table — 同じテーブルを2回作ろうとした
  "42P07": { status: 409, code: "COLLECTION_EXISTS", message: "コレクションはもう作られています" },
  // 42P01 undefined_table — もう消えているテーブルを消そうとした
  "42P01": { status: 404, code: "COLLECTION_NOT_FOUND", message: "コレクションはもう削除されています" },
  // 42703 undefined_column — もう消えている列を消そうとした
  "42703": { status: 404, code: "FIELD_NOT_FOUND", message: "フィールドはもう削除されています" },
  // 23505 unique_violation — メタ行（directus_fields 等）の主キー衝突。列の追加と同時に起きる
  "23505": { status: 409, code: "ALREADY_EXISTS", message: "もう作られています" },
};

/**
 * `error` が上の表に載っている DB エラーなら ApiError に置き換えて投げ直す。
 * 載っていなければ**何もしない**（呼び出し側がそのまま投げ直す）。
 * 🚨 知らないエラーを握り潰さないこと。原因不明の 500 は 500 のまま出す。
 */
export function rethrowAsConflict(error: unknown): void {
  // 🚨 ApiError も `code` を持つ（"COLLECTION_NOT_FOUND" 等）。先に外さないと表を引きに行ってしまう。
  if (isApiError(error)) return;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return;
  const mapped = PG_STATE_TO_API[code];
  if (!mapped) return;
  throw new ApiError(mapped.status, mapped.code, mapped.message);
}

