/**
 * `?error=` の許可リスト。
 *
 * 🚨 **URL には「鍵」しか載せない。文言は載せない。**
 *    以前は route handler が翻訳済みの文言をそのまま `?error=` に入れていたため、
 *    細工したリンクで **攻撃者の任意文言がアプリ公式のエラー枠**
 *    （`border-destructive/30 bg-destructive/10 text-destructive`）に描画された。
 *    実測で確認済み（2026-08-15）。XSS ではない（React が escape する）が、
 *    読み手には本物のシステムメッセージと区別が付かないので、
 *    その枠に電話番号を出せば成立する詐欺ページになる。
 *
 * 🚨 **fail closed。** 知らない値は素通ししない。必ず `unexpected` に落とす。
 *    「知らないものはそのまま出す」にすると許可リストの意味が消える。
 *
 * `i18n/notice.ts` と同じ作り。あちらは成功通知、こちらは失敗。
 */

export const ERROR_KEYS = [
  // 入力の検証（route handler が自分で弾いたもの）
  "invalid_input",
  "invalid_json",
  "field_required",
  "related_collection_required",
  "kind_invalid",
  "delete_target_required",
  // 列は作れたがリレーションの作成で失敗した（途中まで進んでいる＝やり直し方が違う）
  "relation_partial_failure",
  // API 由来（コードから写像したもの）
  "permission_denied",
  "not_found",
  "invalid_body",
  "invalid_field",
  "invalid_interface",
  "conflict",
  // 取りこぼしの受け皿
  "unexpected",
] as const;

export type ErrorKey = (typeof ERROR_KEYS)[number];

/** 知らない値が来たときに出すもの。 */
export const FALLBACK_ERROR_KEY: ErrorKey = "unexpected";

const ERROR_KEY_SET: ReadonlySet<string> = new Set(ERROR_KEYS);

/**
 * URL の `?error=` を既知の鍵へ落とす。
 * 🚨 未知の値は捨てて `unexpected` を返す（**返さない**のではなく、
 *    必ず何かを返す——黙って消すと「失敗したのに画面に何も出ない」になる）。
 */
export function errorKeyFromQuery(value: string | undefined): ErrorKey | null {
  if (!value) return null;
  return ERROR_KEY_SET.has(value) ? (value as ErrorKey) : FALLBACK_ERROR_KEY;
}

/**
 * API のエラーコード（`ApiError` の第2引数）を鍵へ写像する。
 * 🚨 ここに無いコードは `unexpected` になる。**コードを増やしたらこの表にも足すこと。**
 *    足し忘れても危険側には倒れない（一般的な文言になるだけ）。
 */
const API_CODE_TO_KEY: Readonly<Record<string, ErrorKey>> = {
  PERMISSION_DENIED: "permission_denied",
  AUTH_FAILED: "permission_denied",
  INVALID_FIELD: "invalid_field",
  INVALID_BODY: "invalid_body",
  INVALID_JSON: "invalid_json",
  INVALID_INTERFACE: "invalid_interface",
  INVALID_SCHEMA: "invalid_body",
  INVALID_FILTER: "invalid_body",
  COLLECTION_NOT_FOUND: "not_found",
  FIELD_NOT_FOUND: "not_found",
  ITEM_NOT_FOUND: "not_found",
  RELATION_NOT_FOUND: "not_found",
  FOLDER_NOT_FOUND: "not_found",
  ROLE_NOT_FOUND: "not_found",
  POLICY_NOT_FOUND: "not_found",
  LABEL_NOT_FOUND: "not_found",
};

export function errorKeyFromApiCode(code: string | undefined): ErrorKey {
  if (!code) return FALLBACK_ERROR_KEY;
  return API_CODE_TO_KEY[code] ?? FALLBACK_ERROR_KEY;
}
