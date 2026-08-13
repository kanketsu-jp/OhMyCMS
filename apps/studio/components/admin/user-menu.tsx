"use client";

import { LogOut } from "lucide-react";

import { LocaleSwitcher } from "@/components/admin/locale-switcher";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Props = {
  /** いま入っている人。取れなければ null */
  userLabel: string | null;
};

/**
 * いま入っている人と、その人に属する操作（言語 / ログアウト）。
 *
 * 憲章 §6b（オーナー原文）:
 * 「**常に表示するものはそれなりの重要度をもつ。ただ、この『ログアウト』『言語切り替え』は
 *   そうじゃない。個人設定という適した場所がある。**」
 * → ヘッダから降ろして、ここに集めた。
 *
 * 🚨 **PC のサイドバーと SP のドロワーの両方で使う。**
 * 片方にしか置かないと、**もう片方から辿り着けなくなる**。
 * 実際に一度そうなった: ヘッダから降ろしたとき SP のドロワー（`md:hidden`）にしか置かず、
 * **PC ではログアウトも言語切替も 0 個**になっていた（実測で発覚）。
 *
 * 🚨 入れ子の overlay を作らない（Sheet の中に Dropdown / Dialog を重ねると
 * 閉じても DOM に残る問題を ui が実測で報告済み）。素の行のまま。
 */
export function UserMenu({ userLabel }: Props) {
  const t = useT("nav");

  return (
    <div className="shrink-0 border-t px-2 py-2">
      {userLabel ? (
        <p className="truncate px-3 pb-1 text-xs text-muted-foreground">{userLabel}</p>
      ) : null}
      <LocaleSwitcher variant="group" className="mb-1 px-1" />
      <form action="/admin/actions/logout" method="post">
        <button
          type="submit"
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "w-full justify-start px-3",
          )}
        >
          <LogOut />
          {t("logout")}
        </button>
      </form>
    </div>
  );
}
