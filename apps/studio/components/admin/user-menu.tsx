"use client";

import { Check, ChevronsUpDown, LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale, useT } from "@/i18n/client";
import { setLocaleAction } from "@/i18n/actions";
import { LOCALES } from "@/i18n/config";

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
  const tCommon = useT("common");
  const locale = useLocale();
  // 🚨 名前が出せないときの控えは「メニュー」ではなく「アカウント」。
  //    この行は**人のアカウントの行**なので、器の名前（メニュー）を出すと何の行か分からない。
  //    名前が出せない例: エージェント／起動用の内部ユーザー（`lib/admin/user-label.ts`）。
  const label = userLabel ?? t("account");
  const fallback = label.slice(0, 1).toUpperCase();

  return (
    <div className="shrink-0 border-t px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start px-3"
          >
            <Avatar size="sm">
              <AvatarFallback>{fallback}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            <ChevronsUpDown />
          </Button>
        </DropdownMenuTrigger>
        {/*
          🚨 **`DropdownMenuLabel` をここに置かないこと。以前は押すと画面ごと落ちた。**
          base-nova（Base UI）では `Menu.GroupLabel`＝**グループの見出し**で、
          `Menu.Group` の外に置くと `MenuGroupContext is missing` を投げる。
          投げる場所が描画の最中なので React が復帰できず、**タブごと死ぬ**
          （Next.js のエラー画面ではなく "This page couldn't load" になる。実測）。
          🚨 **手本（new-york-v4 / Radix）では Label を単独で置ける。**
          2026-08-15 に Radix へ移してこの制約は解消したが、ここでは中身の重複を避けるため
          引き続き置かない。

          そもそも**中に出す必要が無い**。引き金の行に既にアバターとメールが出ている。
          手本が開いた中でも同じものを出すのは、**畳めるレール**だと引き金に文字が無いため。
          このリポジトリのサイドバーは畳めないので、再掲は重複でしかない。
        */}
        <DropdownMenuContent side="top" align="end">
          {/*
            🚨 **言語も `DropdownMenuItem` にすること。素の button を置かない。**
            Base UI の Menu は **`Menu.Item` の子孫だけ**を ↑↓ の移動対象にしていた。
            ここに `LocaleSwitcher`（素の form + 素の button）を置いていたときは、
            **↓ を4回押しても「日本語」から動かなかった**（実測。Tab では移れた）。
            見た目は同じでも、**キーボードで辿れない項目**になっていた。

            🚨 現在地は**塗りではなく `✓`** で示す（憲章 §3b）。
            メニューの中で塗ると、選択中の項目が「親と違う背景」＝面として数えられる。
          */}
          <form action={setLocaleAction}>
            {LOCALES.map((item) => (
              <DropdownMenuItem key={item} asChild>
                <button
                  type="submit"
                  name="locale"
                  value={item}
                  className="w-full"
                >
                  {tCommon(`locale_${item}`)}
                  {item === locale ? <Check className="ml-auto" /> : null}
                </button>
              </DropdownMenuItem>
            ))}
          </form>
          <DropdownMenuSeparator />
          <form action="/admin/actions/logout" method="post">
            {/*
              🚨 Base UI 時代は `nativeButton` を落とさないこと。
              `Menu.Item` の既定は **false**（当時の実測）。
              既定のまま `<button>` を render すると Base UI が
              「non-<button> を期待していた」と警告を出し、`role` や `aria-disabled` を
              **余計に付ける**。ここは form を submit させたいので `<button>` である必要がある。
              2026-08-15 に Radix へ移して `asChild` で素直に `<button>` を渡せるようになった。
            */}
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <LogOut />
                {t("logout")}
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
