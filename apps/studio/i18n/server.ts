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

  return defaultLocale();
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
