"use client";

import Link from "next/link";
import { Check, Columns3, LayoutGrid } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
 * 🚨 **`DropdownMenuCheckboxItem` / `DropdownMenuRadioItem` を使わない**（2026-08-17 に直した）。
 *    あの 2 つは**中でチェック印の `<span>` を描いてから children を置く**ので、
 *    `asChild` を付けると **Slot に子が 2 つ**になり、**押した瞬間に画面ごと落ちる**
 *    （`Primitive.div failed to slot onto its children.`）。
 *    🚨 **一覧は 200 で出て、ボタンも出る。落ちるのは押したときだけ**だった
 *    ——**ソースを読んでも HTTP を叩いても出ない**。design がブラウザで押して見つけた。
 *
 * ✅ 代わりに **印の無い `DropdownMenuItem` ＋ 自前のチェック印**にしてある。
 *    ＝ **`ui/` を触らずに済み**（shadcn の生成物・影響が全画面に及ぶ）、
 *    **リンクのまま**でいられる（新しいタブ・読み上げ）。
 * 🚨 **印は `opacity-0` で「場所ごと」残す**。消すと、選ぶたびに文字が横へずれる。
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
      {/* 🚨 **幅を持たせる。** `asChild` で `<Link>` を差し込むと、
          shadcn の項目が持っていた `px-2 py-1.5` などが**リンク側に無い**ので、
          文字が縦に潰れる（実測 2026-08-17: メニューが 40px 幅になり、項目名が 1 文字ずつ折れた）。
          🚨 **「開いた」と「読める」は別**——押して見るまで分からなかった。 */}
      <DropdownMenuContent align="end" className="min-w-44">
        {view === "table" ? (
          <>
            <DropdownMenuLabel>{t("options_columns")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* 🚨 **名前も出す**（2026-08-17 から消せる）。
                 行のどこでもクリックで開けるようにしたので、名前が無くても行を開ける。
                 経緯は `lib/admin/files-view.ts` の `ALWAYS_ON_COLUMN`。 */}
            {FILE_COLUMNS.map((column) => (
              <DropdownMenuItem key={column} asChild>
                <Link
                  href={columnHref[column]}
                  aria-checked={columns.includes(column)}
                  role="menuitemcheckbox"
                  // 🚨 リンクに項目の見た目を自分で持たせる（`asChild` は中身を差し替えるだけ）
                  className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-2 py-1.5 text-sm"
                >
                  <Check className={columns.includes(column) ? "size-4" : "size-4 opacity-0"} aria-hidden />
                  {t(`column_${column}`)}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        ) : (
          <>
            <DropdownMenuLabel>{t("options_card_columns")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CARD_COLUMN_CHOICES.map((count) => (
              <DropdownMenuItem key={count} asChild>
                <Link
                  href={cardColumnsHref[count]}
                  aria-checked={cardColumns === count}
                  role="menuitemradio"
                  className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-2 py-1.5 text-sm"
                >
                  <Check className={cardColumns === count ? "size-4" : "size-4 opacity-0"} aria-hidden />
                  {t("options_columns_count", { count })}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
