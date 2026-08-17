"use client";

import Link from "next/link";
import { Columns3, LayoutGrid } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/client";
import {
  CARD_COLUMN_CHOICES,
  FILE_COLUMNS,
  type CardColumns,
  type FileColumn,
} from "@/lib/admin/files-view";
import { cn } from "@/lib/utils";

/**
 * 一覧の「表示形式ごとの設定」。
 *
 * 🚨 **表とカードで、出す設定が違う**（`decisions/list-views-are-switchable-layouts`）。
 *    表   … 出す項目（列）
 *    カード … 1 行に並べる数
 *    **両方いつも出すと、いま効かない設定が並ぶ**（押しても何も起きない項目ができる）。
 *
 * 🚨 **中身は `<Link>`**（`files-view-switch.tsx` と同じ理由）。
 *    状態は URL に在るので、リンクで移れば「戻る」も「新しいタブ」も標準どおり効く。
 *    ボタンにして push すると、その 2 つが自分で書く羽目になる。
 *
 * 🚨 **`DropdownMenuCheckboxItem` / `DropdownMenuRadioItem` の `onSelect` を止めていない**理由:
 *    リンクを踏ませたいので、**選んだら閉じてよい**。閉じないほうが自然な場面
 *    （複数を続けて切り替える）も在るが、**URL が変わる＝ページが変わる**ので、
 *    開いたままにしても中身が古くなるだけ。
 */
export function FilesViewOptions({
  view,
  columns,
  cardColumns,
  columnHref,
  cardColumnsHref,
}: {
  view: "grid" | "table";
  /** 表でいま出している項目。 */
  columns: readonly FileColumn[];
  /** カードでいま並べている数。 */
  cardColumns: CardColumns;
  /**
   * その項目を**入れ替えた**ときの行き先。
   * 🚨 **関数ではなく、あらかじめ作った文字列の表で受ける**
   *    （サーバ側の描画から関数は渡せない。`files-view-switch.tsx` で踏んだ）。
   */
  columnHref: Record<FileColumn, string>;
  cardColumnsHref: Record<CardColumns, string>;
}) {
  const t = useT("files");
  const label = view === "table" ? t("options_columns") : t("options_card_columns");

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
        {view === "table" ? <Columns3 className="size-4" /> : <LayoutGrid className="size-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {view === "table" ? (
          <>
            <DropdownMenuLabel>{t("options_columns")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/*
              🚨 **名前の列は出さない。** 消せないものを「消せそうに」見せない。
                 （`ALWAYS_ON_COLUMN` の理由は `lib/admin/files-view.ts` に書いてある）
            */}
            {FILE_COLUMNS.map((column) => (
              <DropdownMenuCheckboxItem
                key={column}
                checked={columns.includes(column)}
                asChild
              >
                <Link href={columnHref[column]}>{t(`column_${column}`)}</Link>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : (
          <>
            <DropdownMenuLabel>{t("options_card_columns")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={String(cardColumns)}>
              {CARD_COLUMN_CHOICES.map((count) => (
                <DropdownMenuRadioItem key={count} value={String(count)} asChild>
                  <Link href={cardColumnsHref[count]}>{t("options_columns_count", { count })}</Link>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
