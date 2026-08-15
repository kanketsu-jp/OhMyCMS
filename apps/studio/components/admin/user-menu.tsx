"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/client";

type Props = {
  /**
   * いま入っている人の表示名（1行目）。取れなければ null。
   * 🚨 省略可（`?`）にしない。`userAvatarEmoji` と同じ理由で、省略できると
   * 渡し忘れた呼び出し側で `tsc` が黙って通り、画面だけ変わらない事故になる。
   */
  userName: string | null;
  /** いま入っている人のメールアドレス（2行目）。取れなければ null（その行ごと出さない） */
  userLabel: string | null;
  /** SSO のプロフィール画像。取れなければ null */
  userPicture: string | null;
  /**
   * アバターに出す絵文字。画像が無いときの控え。
   * 🚨 省略可（`?`）にしない。省略できると渡し忘れた呼び出し側で `tsc` が黙って通り、
   * 画面だけ変わらない事故になる。
   */
  userAvatarEmoji: string;
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
export function UserMenu({ userName, userLabel, userPicture, userAvatarEmoji }: Props) {
  const t = useT("nav");
  // 🚨 名前が出せないときの控えは「メニュー」ではなく「アカウント」。
  //    この行は**人のアカウントの行**なので、器の名前（メニュー）を出すと何の行か分からない。
  //    名前が出せない例: エージェント／起動用の内部ユーザー（`lib/admin/user-label.ts`）。
  //    🚨 控えは辞書の固定文言であって、メールアドレス（`userLabel`）を代用しない
  //       （判断ボード 設問211。1行目＝名前・2行目＝メールという役割を保つ）。
  const name = userName ?? t("account");

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
              {userPicture ? (
                <AvatarImage src={userPicture} alt="" referrerPolicy="no-referrer" />
              ) : null}
              <AvatarFallback>{userAvatarEmoji}</AvatarFallback>
            </Avatar>
            {/* 2行構成（判断ボード 設問211）: 1行目＝表示名（固定文言の控え）/ 2行目＝メール（無ければ行ごと省略）。
                どちらも `truncate` + 親の `min-w-0` で、長い値でも 16rem のサイドバーからはみ出さない。 */}
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate">{name}</span>
              {userLabel ? (
                <span className="truncate text-xs text-muted-foreground">{userLabel}</span>
              ) : null}
            </span>
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
          <DropdownMenuItem asChild>
            <Link href="/admin/profile">
              <Settings />
              {t("profile")}
            </Link>
          </DropdownMenuItem>
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
