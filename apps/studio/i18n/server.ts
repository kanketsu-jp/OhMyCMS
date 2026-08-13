/**
 * Server Component / Route Handler 用の i18n 入口。
 * next/headers を使うので client component から import しないこと。
 *
 * ロケールの決定順（仕様 F1 §3-2）:
 *   1. Cookie (ohmycms_locale)
 *   2. Accept-Language ヘッダ
 *   3. 環境変数 OHMYCMS_DEFAULT_LOCALE（既定 "ja"）
 * ※ 1 の前に「DB に保存された本人の設定」が入る予定だが、それは F2 以降。
 */

import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE,
  defaultLocale,
  isLocale,
  matchAcceptLanguage,
  type Locale,
} from "./config";
import { messagesFor } from "./messages";
import {
  createFormatter,
  createScopedTranslator,
  createTranslator,
  type Formatter,
  type Messages,
  type Translator,
} from "./translator";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headerStore = await headers();
  const fromHeader = matchAcceptLanguage(headerStore.get("accept-language"));
  if (fromHeader) return fromHeader;

  // 🚨 環境変数より先に「全体設定の既定言語」を見る（F2 §2-A の
  //    「環境変数は初期値・DB の行が正」を、言語にも効かせるため）。
  //    ここを繋がないと、GUI で既定の言語を選んでも保存されるだけで何も起きない
  //    （実測でその状態だった。設定画面は正しく動いていたので気づきにくい）。
  const fromSettings = await settingsDefaultLocale();
  if (fromSettings) return fromSettings;

  return defaultLocale();
}

/**
 * 全体設定に保存された既定言語。無ければ null。
 *
 * 🚨 **DB が読めなくても落とさない。** この関数は app/layout.tsx から
 *    毎リクエスト呼ばれるので、ここで throw するとログイン画面ごと 500 になる。
 *    設定はあくまで「既定値の上書き」なので、読めなければ環境変数へ落ちればよい。
 */
async function settingsDefaultLocale(): Promise<Locale | null> {
  try {
    const { getSettings } = await import("@/lib/settings/service");
    const settings = await getSettings();
    // getSettings() は環境変数と既定値もまとめて解決して返すので、
    // 「DB に保存されている」ときだけ採用する（そうしないと env の分岐が二重になる）。
    if (settings.sources.default_locale !== "database") return null;
    return isLocale(settings.default_locale) ? settings.default_locale : null;
  } catch {
    return null;
  }
}

export async function getMessages(): Promise<Messages> {
  return messagesFor(await getLocale());
}

/**
 * 辞書引き関数を得る。名前空間を渡すとその配下に限定される。
 *   const t = await getT("files");  t("title")  === "files.title"
 *   const t = await getT();         t("files.title")
 */
export async function getT(namespace?: string): Promise<Translator> {
  const messages = messagesFor(await getLocale());
  return namespace
    ? createScopedTranslator(messages, namespace)
    : createTranslator(messages);
}

/** 日付・数値フォーマッタを得る。 */
export async function getFormat(): Promise<Formatter> {
  return createFormatter(await getLocale());
}
