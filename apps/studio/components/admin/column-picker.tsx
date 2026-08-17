"use client";

import Link from "next/link";
import { Check, Columns3 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * 表の「出す項目」を選ぶ。**どの一覧でも使える**（選択肢は呼ぶ側が渡す）。
 *
 * ## なぜ一般化したか（2026-08-17）
 *
 * 堀池指示「**また列が選択できないし**」で `files` に付けたが、
 * **`content/[collection]` には状態（`?cols=`）だけ在って、触る操作が無かった**（司令塔の実測）。
 * content は**欄がコレクションごとに違う**ので、`FilesViewOptions` をそのままは使えない。
 *
 * 🚨 **content 用にもう 1 つ作らない。** 同じことをする書き方が 2 つ在ると、
 *   **片方だけ直る／次に数える人が片方を落とす**（この PJ で今日 6 回起きている形）。
 *   → **選択肢を渡せる形にして、`files` 側もこれで書く**。
 *
 * ## 渡すもの
 *
 * 🚨 **`href` は文字列で受ける。関数を渡さない。**
 *   一覧はサーバ側で描くので、**関数はシリアライズできない**
 *   （`files-view-switch.tsx` で 1 度踏んでいる）。
 *
 * 🚨 **`href: null` は「切り替えられない項目」。** リンクにせず、押せない行として出す。
 *   使う場面: **最後の 1 本を外そうとしたとき**——
 *   `lib/admin/list-view.ts` の `resolveColumns` は **0 本になると既定へ戻す**ので、
 *   外せるように見せると「**外したのに 8 本戻ってくる**」になる。
 *   ＝ **できないことを、できそうに見せない**（パンくずの「押せない区画」と同じ判断）。
 *
 * ## 見た目の由来（`files-view-options.tsx` から引き継ぐ）
 *
 * 🚨 **`DropdownMenuCheckboxItem` を使わない。** 中でチェック印の `<span>` を描いてから
 *   children を置くので、`asChild` を付けると **Slot に子が 2 つ**になり、
 *   **押した瞬間に画面ごと落ちる**（2026-08-17 実測。**ソースを読んでも HTTP を叩いても出ない**）。
 * 🚨 **印は `opacity-0` で場所ごと残す**。消すと、選ぶたびに文字が横へずれる。
 * 🚨 **リンクに項目の見た目を自分で持たせる**（`asChild` は中身を差し替えるだけなので、
 *   shadcn 側の `px-2 py-1.5` が乗らず、**文字が縦に潰れる**）。
 */
export type ColumnChoice = {
  /** React の key と、区別のためだけに使う。画面には出ない。 */
  key: string;
  /** 画面に出す名前。**呼ぶ側が辞書から引いて渡す**（ここは文言を持たない）。 */
  label: string;
  /** 入れ替えた先。**`null` なら切り替えられない**（最後の 1 本など）。 */
  href: string | null;
  checked: boolean;
};

export function ColumnPicker({
  label,
  choices,
}: {
  /** 引き金の読み上げ名と、メニューの見出し。 */
  label: string;
  choices: readonly ColumnChoice[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md",
          "text-muted-foreground hover:text-foreground active:text-foreground",
        )}
      >
        <Columns3 className="size-4" />
      </DropdownMenuTrigger>
      {/* 🚨 幅を持たせる（実測 2026-08-17: 持たせないとメニューが 40px になり、項目名が 1 文字ずつ折れた）。 */}
      <DropdownMenuContent align="end" className="max-h-96 min-w-44 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {choices.map((choice) =>
          choice.href === null ? (
            <div
              key={choice.key}
              // 🚨 押せないので `DropdownMenuItem` にしない（項目にすると押せそうに見える）。
              className="flex w-full items-center gap-2 whitespace-nowrap px-2 py-1.5 text-sm text-muted-foreground"
            >
              <Check className={choice.checked ? "size-4" : "size-4 opacity-0"} aria-hidden />
              {choice.label}
            </div>
          ) : (
            <DropdownMenuItem key={choice.key} asChild>
              <Link
                href={choice.href}
                aria-checked={choice.checked}
                role="menuitemcheckbox"
                className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-2 py-1.5 text-sm"
              >
                <Check className={choice.checked ? "size-4" : "size-4 opacity-0"} aria-hidden />
                {choice.label}
              </Link>
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
