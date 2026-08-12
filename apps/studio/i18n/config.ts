/**
 * i18n の設定値。server / client の両方から import される純粋モジュール。
 * ここでは next/* を import しないこと（client component からも読まれるため）。
 */

export const LOCALES = ["ja", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** ロケールを保存する Cookie 名。 */
export const LOCALE_COOKIE = "ohmycms_locale";

/** Cookie の寿命（1年）。 */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** 環境変数が未設定・不正なときに使う最終フォールバック。 */
export const FALLBACK_LOCALE: Locale = "ja";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * 環境変数 OHMYCMS_DEFAULT_LOCALE から既定ロケールを読む。
 * 未設定・不正な値なら FALLBACK_LOCALE。
 */
export function defaultLocale(): Locale {
  const fromEnv = process.env.OHMYCMS_DEFAULT_LOCALE;
  return isLocale(fromEnv) ? fromEnv : FALLBACK_LOCALE;
}

/**
 * Accept-Language ヘッダから対応ロケールを選ぶ。
 * 例: "en-US,en;q=0.9,ja;q=0.8" → "en"
 * 対応するものが無ければ null（呼び出し側が既定へフォールバックする）。
 */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;

  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return {
        // "en-US" → "en"。大文字小文字は無視する。
        base: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((c) => c.base.length > 0 && c.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const candidate of candidates) {
    if (isLocale(candidate.base)) return candidate.base;
  }
  return null;
}
