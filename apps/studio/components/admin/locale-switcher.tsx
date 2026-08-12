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
      className={cn("flex items-center rounded-md border p-0.5", className)}
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
