"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { List } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n/client";
import { CARD_COLUMN_CHOICES, type CardColumns } from "@/lib/admin/files-view";
import { cn } from "@/lib/utils";

/**
 * カード表示と表表示の切り替え。
 *
 * 🚨 **状態は URL に持つ**（`?view=table`）。`localStorage` に隠さない理由:
 *   ・URL を共有すると**相手も同じ見え方**になる
 *   ・リロードしても残る
 *   ・**サーバ側で最初から正しい形を返せる**（読み込んでから切り替わる、が起きない）
 *   （2026-08-15 の規約。schema も同じ結論に着いたので揃えた）
 *
 * 🚨 表は **`<Link>` で作る**（ボタンにして push しない）。リンクなら
 *   「新しいタブで開く」も「戻る」も**ブラウザの標準の動きがそのまま効く**。
 *   カードは列数の選択も兼ねるため Select で遷移する。
 */
export function FilesViewSwitch({
  view,
  tableHref,
  cardColumns,
  gridCardColumnsHref,
}: {
  view: "grid" | "table";
  /**
   * それぞれに切り替えたときの行き先。**他のクエリを保つのは呼び出し側の責任**。
   * 🚨 **関数ではなく文字列で受ける。** サーバ側の描画からは**関数を渡せない**
   *    （境界を越えられず 500 になる。実際に踏んだ）。
   */
  tableHref: string;
  cardColumns: CardColumns;
  gridCardColumnsHref: Record<CardColumns, string>;
}) {
  const t = useT("files");
  const router = useRouter();
  const cardColumnsLabel = t("options_card_columns");

  return (
    <div className="inline-flex items-center gap-1">
      <Select
        value={String(cardColumns)}
        onValueChange={(next) => router.push(gridCardColumnsHref[Number(next) as CardColumns])}
      >
        <SelectTrigger
          aria-current={view === "grid" ? "true" : undefined}
          aria-label={cardColumnsLabel}
          title={cardColumnsLabel}
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {CARD_COLUMN_CHOICES.map((count) => (
              <SelectItem key={count} value={String(count)}>
                {t("options_columns_count", { count })}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Link
        href={tableHref}
        // 🚨 いまの見え方を読み上げにも伝える。見た目の色だけだと、目で見ない人に分からない。
        aria-current={view === "table" ? "true" : undefined}
        aria-label={t("view_table")}
        title={t("view_table")}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md",
          view === "table" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground active:text-foreground",
        )}
      >
        <List className="size-4" />
      </Link>
    </div>
  );
}
