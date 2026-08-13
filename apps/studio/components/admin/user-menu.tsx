"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";

import { LocaleSwitcher } from "@/components/admin/locale-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
 * 🚨 PC のサイドバー末尾も SP のドロワー末尾も画面の下端なので、メニューは常に上へ開く。
 */
export function UserMenu({ userLabel }: Props) {
  const t = useT("nav");
  const label = userLabel ?? t("menu_title");
  const fallback = label.slice(0, 1).toUpperCase();

  return (
    <div className="shrink-0 border-t px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start px-3"
            />
          }
        >
          <Avatar size="sm">
            <AvatarFallback>{fallback}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronsUpDown />
        </DropdownMenuTrigger>
        {/*
          🚨 **`DropdownMenuLabel` をここに置かないこと。押すと画面ごと落ちる。**
          あれは base-nova（Base UI）では `Menu.GroupLabel`＝**グループの見出し**で、
          `Menu.Group` の外に置くと `MenuGroupContext is missing` を投げる。
          投げる場所が描画の最中なので React が復帰できず、**タブごと死ぬ**
          （Next.js のエラー画面ではなく "This page couldn't load" になる。実測）。
          🚨 **手本（new-york-v4 / Radix）では Label を単独で置ける。そこが違う。**

          そもそも**中に出す必要が無い**。引き金の行に既にアバターとメールが出ている。
          手本が開いた中でも同じものを出すのは、**畳めるレール**だと引き金に文字が無いため。
          このリポジトリのサイドバーは畳めないので、再掲は重複でしかない。
        */}
        <DropdownMenuContent side="top" align="end">
          <LocaleSwitcher variant="group" className="px-1 py-1" />
          <DropdownMenuSeparator />
          <form action="/admin/actions/logout" method="post">
            {/*
              🚨 `nativeButton` を落とさないこと。`Menu.Item` の既定は **false**
              （`node_modules/@base-ui/react/menu/item/MenuItem.js:28` で実測）。
              既定のまま `<button>` を render すると Base UI が
              「non-<button> を期待していた」と警告を出し、`role` や `aria-disabled` を
              **余計に付ける**。ここは form を submit させたいので `<button>` である必要がある。
              （`Menu.Trigger` の既定は逆に true なので、引き金側には要らない）
            */}
            <DropdownMenuItem
              nativeButton
              render={<button type="submit" className={cn("w-full")} />}
            >
              <LogOut />
              {t("logout")}
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
