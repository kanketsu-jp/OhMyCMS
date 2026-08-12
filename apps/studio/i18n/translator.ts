/**
 * 辞書引きと Intl フォーマットの実装。
 * server / client の両方から使うので next/* に依存しない純粋モジュールにしている。
 */

import type { Locale } from "./config";

/** 辞書は名前空間で入れ子になった JSON。葉は文字列。 */
export type Messages = { [key: string]: string | Messages };

export type TranslateValues = Record<string, string | number>;

/** "nav.collections" のようなドット区切りキーで辞書を引く。 */
function lookup(messages: Messages, key: string): string | undefined {
  let current: string | Messages | undefined = messages;
  for (const segment of key.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = current[segment];
  }
  return typeof current === "string" ? current : undefined;
}

/** "{name} を削除しました" の {name} を埋める。 */
function interpolate(template: string, values?: TranslateValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export type Translator = (key: string, values?: TranslateValues) => string;

/**
 * 辞書引き関数を作る。
 * キーが無いときはキー文字列自体を返す（画面が壊れるより、どのキーが欠けているか見える方がよい）。
 * キー欠けの検出は scripts/check-i18n-keys.mjs が機械的に行う。
 */
export function createTranslator(messages: Messages): Translator {
  return (key, values) => {
    const template = lookup(messages, key);
    if (template === undefined) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] 辞書キーが見つかりません: ${key}`);
      }
      return key;
    }
    return interpolate(template, values);
  };
}

/**
 * 名前空間を前置きした辞書引き関数を作る。
 * createScopedTranslator(messages, "files")("title") === t("files.title")
 */
export function createScopedTranslator(messages: Messages, namespace: string): Translator {
  const t = createTranslator(messages);
  return (key, values) => t(`${namespace}.${key}`, values);
}

/** BCP47 のロケールタグ。Intl へ渡す。 */
const INTL_LOCALE: Record<Locale, string> = {
  ja: "ja-JP",
  en: "en-US",
};

export type Formatter = {
  /** 日付のみ。ja: 2026/08/13 / en: Aug 13, 2026 */
  date: (value: Date | string | number) => string;
  /** 日付+時刻。ja: 2026/08/13 15:30 / en: Aug 13, 2026, 3:30 PM */
  dateTime: (value: Date | string | number) => string;
  /** 桁区切りつきの数値。 */
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** 短縮表記。ja: 1.2万 / en: 12K */
  compactNumber: (value: number) => string;
  /** ファイルサイズ。Intl の単位フォーマットを使う。 */
  fileSize: (bytes: number | string | null | undefined) => string;
};

function toDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createFormatter(locale: Locale): Formatter {
  const tag = INTL_LOCALE[locale];

  return {
    date(value) {
      const date = toDate(value);
      if (!date) return "";
      return new Intl.DateTimeFormat(tag, { dateStyle: "medium" }).format(date);
    },
    dateTime(value) {
      const date = toDate(value);
      if (!date) return "";
      return new Intl.DateTimeFormat(tag, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    },
    number(value, options) {
      if (!Number.isFinite(value)) return "";
      return new Intl.NumberFormat(tag, options).format(value);
    },
    compactNumber(value) {
      if (!Number.isFinite(value)) return "";
      return new Intl.NumberFormat(tag, { notation: "compact" }).format(value);
    },
    fileSize(bytes) {
      const raw = typeof bytes === "string" ? Number.parseInt(bytes, 10) : bytes;
      if (raw === null || raw === undefined || !Number.isFinite(raw)) return "";

      // 1000 進で単位を選ぶ（Intl の unit が kilobyte/megabyte/gigabyte = 10進のため）。
      const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;
      let value = raw;
      let unitIndex = 0;
      while (value >= 1000 && unitIndex < units.length - 1) {
        value /= 1000;
        unitIndex += 1;
      }

      return new Intl.NumberFormat(tag, {
        style: "unit",
        unit: units[unitIndex],
        unitDisplay: "short",
        maximumFractionDigits: unitIndex === 0 ? 0 : 1,
      }).format(value);
    },
  };
}
