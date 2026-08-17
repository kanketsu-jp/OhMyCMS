"use client";

import { ColumnPicker } from "@/components/admin/column-picker";
import { useT } from "@/i18n/client";
import { FILE_COLUMNS, type FileColumn } from "@/lib/admin/files-view";

/**
 * 一覧の「表示形式ごとの設定」。
 *
 * 🚨 **表とカードで、出す設定が違う**（`decisions/list-views-are-switchable-layouts`）。
 *    表   … 出す項目（列）
 *    カード … 1 行に並べる数
 *    **両方いつも出すと、いま効かない設定が並ぶ**（押しても何も起きない項目ができる）。
 *
 * 🚨 カードの列数は `FilesViewSwitch` の Select に移した。
 *    ここは表でだけ列選択を返し、カード表示では何も出さない。
 */
export function FilesViewOptions({
  view,
  columns,
  columnHref,
}: {
  view: "grid" | "table";
  /** 表でいま出している項目。 */
  columns: readonly FileColumn[];
  /**
   * その項目を**入れ替えた**ときの行き先。
   * 🚨 **関数ではなく、あらかじめ作った文字列の表で受ける**
   *    （サーバ側の描画から関数は渡せない。`files-view-switch.tsx` で踏んだ）。
   */
  columnHref: Record<FileColumn, string>;
}) {
  const t = useT("files");

  // 🚨 表の「出す項目」は **`ColumnPicker`（共通）** に寄せた（2026-08-17）。
  //    content にも同じものが要り、**2 つ作ると片方だけ直る**ため。
  //    🚨 **見た目は 1px も変えていない**——引き金の class もメニューの中身も同じものを移しただけ。
  //    🚨 files では **`href` に `null` を渡さない**（列は 4 本固定で、
  //      `readColumns` は空を「全部外した」として尊重する＝ **0 本にできてよい**）。
  //      content 側だけが「最後の 1 本は外せない」を持つ（`resolveColumns` が既定へ戻すため）。
  if (view === "table") {
    return (
      <ColumnPicker
        label={t("options_columns")}
        choices={FILE_COLUMNS.map((column) => ({
          key: column,
          label: t(`column_${column}`),
          href: columnHref[column],
          checked: columns.includes(column),
        }))}
      />
    );
  }

  return null;
}
