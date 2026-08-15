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
type Props = {
  className?: string;
  /**
   * 見せ方。
   * - `compact` … ログイン画面のヘッダ用（小さい文字の2択）
   * - `group`   … メニューの中のユーザー行用（**ButtonGroup・44px**。堀池さんの指示）
   *
   * 🚨 管理画面のヘッダからは降ろした（憲章 §6b「常に見えている＝それだけの重要度がある」）。
   * ログイン画面だけは残す。**オンボーディングより前に来る**ので、
   * そこで選べないと日本語以外の人が辿り着けない。
   */
  variant?: "compact" | "group";
};

export function LocaleSwitcher({ className, variant = "compact" }: Props) {
  const current = useLocale();
  const t = useT("common");
  const group = variant === "group";

  return (
    <form
      action={setLocaleAction}
      // 🚨 器は面を持たない。**選択中のボタンの背景だけ**で現在地を示す。
      // 器にも背景を持たせると「器 + ボタン」で面が2段になり、ヘッダ(罫線)と合わせて深さ3になる。
      // これは全画面に出る（ヘッダは共通なので）ため、発生源として潰している。
      // knowledge/decisions/no-nested-surfaces.md §2-2
      className={cn(
        group ? "flex w-full items-center gap-1" : "flex items-center gap-0.5",
        className,
      )}
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
              "font-medium transition-colors",
              group
                // 指で押すので 44px。面は作らない（選択中の塗りだけで現在地を示す）
                ? "flex h-(--control-h) flex-1 items-center justify-center rounded-md text-sm"
                // 🚨 **文字は小さいまま、押せる範囲だけ広げる。**
                // 文字の分しか高さが無く 24px しかなかった（実測。WCAG 2.5.8 の 24px ぎりぎり）。
                // ここはログイン画面＝**オンボーディングより前**で、日本語以外の人が
                // 最初に触る唯一の切替なので、指で外すと先へ進めない。
                // `text-xs` は変えない（ログイン画面で言語が主役になってしまうため）。
                // 🚨 **2026-08-15 に一度戻された。** コメントだけ残り、クラスが消えていた。
                //    英語では 24px でも収まって見えるが、これは高さの話なので言語に関係なく足りない。
                : "flex min-h-(--control-h) items-center rounded px-2 py-1 text-xs md:min-h-(--control-h-pc)",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground active:text-foreground",
            )}
          >
            {t(`locale_${locale}`)}
          </button>
        );
      })}
    </form>
  );
}
