/**
 * 「どの欄が、なぜ悪いか」の 1 件。
 *
 * 🚨 **文言を持たせない。** `field`（スキーマ識別子）と `code` だけを運ぶ。
 *    理由: `lib/admin/forms.ts` に **`apiMessage()` を 2026-08-15 に削除した経緯**が書いてある。
 *    API の生文言を画面へ流すと、細工したリンクで**任意の文章をアプリ公式のエラー枠**へ出せる。
 *    **欄ごとに message を足すのは、その関数を欄の数だけ作り直すのと同じ。**
 *    文言は画面側が辞書から引き、表示名は `lib/schema/labels.ts` の `fieldLabel` が解決する。
 *
 * 🚨 **同じ `field` が 2 行出てよい**（必須かつ形式違反、が同時に起きうる）。
 *    何件見せるかは画面の判断で、入れ物は減らさない。
 *
 * 決定: `knowledge/decisions/field-errors-need-a-container.md`
 */
export type FieldIssue = {
  /** スキーマ識別子（"title" / "status"）。🚨 辞書化しない（AGENTS.md §3.8） */
  field: string;
  /** `ApiError` の code と同じ空間。画面側は `errorKeyFromApiCode` で鍵へ落とす */
  code: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /**
     * 🚨 **任意**。渡さなければ応答は今までと 1 バイトも変わらない
     * （`lib/schema/api.ts` が `fields` を載せるのは、1 件以上あるときだけ）。
     * 既存の `new ApiError(...)` 309 件は無改修で動く。
     */
    public readonly fields?: readonly FieldIssue[],
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
  // 23502 not_null_violation — 必須の列に値が無い。
  // 🚨 これは利用者の入力の問題なので **400**。500 にすると「アプリが壊れた」に見える。
  // 実例: 主キーが integer で自動採番でないコレクションに、id を省いて作ろうとしたとき。
  "23502": { status: 400, code: "REQUIRED_FIELD", message: "必須の項目が空です" },
  // 22P02 invalid_text_representation — 型に合わない値（uuid の列に "abc" 等）
  "22P02": { status: 400, code: "INVALID_VALUE", message: "値の形式が正しくありません" },
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

