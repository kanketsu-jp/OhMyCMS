"use client";

import { useLocale, useT } from "@/i18n/client";
import { setLocaleAction } from "@/i18n/actions";
import { LOCALES } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Locale switcher.
 * Language names are endonyms by convention, so common.locale_* holds the
 * same value in both ja.json and en.json.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const current = useLocale();
  const t = useT("common");

  return (
    <form
      action={setLocaleAction}
      // 🚨 器は面を持たない。**選択中のボタンの背景だけ**で現在地を示す。
      // 器にも背景を持たせると「器 + ボタン」で面が2段になり、ヘッダ(罫線)と合わせて深さ3になる。
      // これは全画面に出る（ヘッダは共通なので）ため、発生源として潰している。
      // docs/design/surface-rules.md §2-2
      className={cn("flex items-center gap-0.5", className)}
    >
      {LOCALES.map((locale) => {
        const isActive = locale === current;
        return (
          <button
            key={locale}
            type="submit"
            name="locale"
            value={locale}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`locale_${locale}`)}
          </button>
        );
      })}
    </form>
  );
}
