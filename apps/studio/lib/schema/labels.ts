import type { FieldResult } from "./models";

/**
 * 欄名（フィールドの表示名）を、ロケードごとの辞書から解決する（設問286 A）。
 *
 * 🚨 **なぜ 1 箇所に集めるか。** いま画面は**生の識別子**（`body_rich` / `created_at`）を
 * そのまま描いており、実測（2026-08-16）で `field.field` を直接描く箇所が **22 行**あった。
 * 各所で `translations?.[locale] ?? field.field` と書くと**必ず割れる**
 * （フォールバックの順序・空文字の扱い・ロケールの切り出し方が、書いた人ごとに変わる）。
 *
 * 🚨 **Next.js に依存させない**（`AGENTS.md §3.6`）。ロケールは呼び出し側が渡す。
 *
 * 解決順:
 *   1. 完全一致（`ja` / `en`）
 *   2. 🚨 **言語だけの一致**（`ja-JP` で引かれたら `ja` を見る）。地域差で名前が消えるより、
 *      同じ言語の名前が出るほうがよい
 *   3. `fallbackLocale`（既定 `"ja"`）
 *   4. 🚨 **生の識別子**（`field`）
 *
 * 🚨 **空文字・空白だけの値は「名前が無い」として扱う**（次の候補へ進む）。
 * 空欄で保存した人に、画面から名前が消えた状態を見せないため。
 */
export function fieldLabel(
  field: Pick<FieldResult, "field" | "meta">,
  locale: string,
  fallbackLocale = "ja",
): string {
  const 辞書 = field.meta?.translations;
  const 引く = (key: string): string | null => {
    if (!辞書 || typeof 辞書 !== "object") return null;
    const value = (辞書 as Record<string, unknown>)[key];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const 言語だけ = locale.split("-")[0];
  return 引く(locale) ?? 引く(言語だけ) ?? 引く(fallbackLocale) ?? field.field;
}

/**
 * 書き込み前の検査。**受け取れる形だけを通す**（fail-closed）。
 *
 * 🚨 URL や API の本文は他人が書けるので、`translations` に何でも入れられると
 * **画面へそのまま出る文字列を、型の保証なしに DB へ置く**ことになる。
 * 通すのは「**文字列だけを値に持つ、浅いオブジェクト**」。
 *
 * @returns 正しければ整えた辞書（空になったら `null`）。形が違えば `null` ではなく `undefined`
 *   を返し、呼び出し側が「消す指示」と「壊れた入力」を区別できるようにする。
 */
export function parseFieldTranslations(value: unknown): Record<string, string> | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;

  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    // ロケール鍵は英数字とハイフンだけ（`ja` / `en` / `pt-BR`）。
    if (!/^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})*$/.test(key)) return undefined;
    if (typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    // 🚨 空文字は「その言語の名前を消す」意味として受け取り、鍵ごと落とす
    //    （空文字を残すと、`fieldLabel` 側で毎回スキップ判定が要る）。
    if (trimmed.length > 0) out[key] = trimmed;
  }
  return Object.keys(out).length > 0 ? out : null;
}
