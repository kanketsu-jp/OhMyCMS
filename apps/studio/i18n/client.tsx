"use client";

/**
 * Client Component 用の i18n。
 * ロケールと辞書はサーバ（app/layout.tsx）から props で渡される。
 * ここで next/headers を読まないこと（クライアントには Cookie 解決の責務を持たせない）。
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./config";
import {
  createFormatter,
  createScopedTranslator,
  createTranslator,
  type Formatter,
  type Messages,
  type Translator,
} from "./translator";

type I18nContextValue = {
  locale: Locale;
  messages: Messages;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("I18nProvider の外側で i18n フックが呼ばれました");
  }
  return value;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

/**
 * 辞書引きフック。名前空間を渡すとその配下に限定される。
 *   const t = useT("files");  t("title")
 */
export function useT(namespace?: string): Translator {
  const { messages } = useI18n();
  return useMemo(
    () =>
      namespace
        ? createScopedTranslator(messages, namespace)
        : createTranslator(messages),
    [messages, namespace],
  );
}

/** 日付・数値フォーマッタのフック。 */
export function useFormat(): Formatter {
  const { locale } = useI18n();
  return useMemo(() => createFormatter(locale), [locale]);
}
