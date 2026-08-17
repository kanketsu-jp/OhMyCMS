"use client";

import Link from "next/link";
import { FolderPlus, Upload } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useT } from "@/i18n/client";
import { clearSelection } from "@/lib/admin/files-selection";

export function FilesPageMenu({
  newFileHref,
  newFolderHref,
  children,
}: {
  newFileHref: string;
  newFolderHref: string;
  children: React.ReactNode;
}) {
  const t = useT("files");

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block"
        /**
         * タイルの無い所を押したら選択を外す。
         *
         * 🚨 **`event.target === event.currentTarget` では効かない**（2026-08-17 実測）。
         *    この受け口は一覧の器（`Surface`）を丸ごと包んでいて、**器が全面を埋めている**ので、
         *    受け口そのものが当たる点が**画面上に 1 点も無かった**
         *    （器の矩形を 4px 刻みで全部当たって `elementFromPoint` が受け口を返す点＝ 0 件）。
         *    ＝ 条件は書いてあるのに**一度も真にならない**。押しても何も起きない形。
         *
         * ✅ 代わりに「**押した先がタイルでなければ外す**」で見る。
         *    タイルは `<a>` か `<button>`（画像は button・それ以外は Link）なので、
         *    祖先にそのどちらも無ければ「タイルの無い所」。
         *    上の道具立て（列数の Select・表への切り替え）も button / a なので、
         *    **押しても選択は消えない**（消すと操作のたびに選択が飛ぶ）。
         */
        onClick={(event) => {
          const hitTile = (event.target as HTMLElement | null)?.closest("a,button");
          if (!hitTile) clearSelection();
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuGroup>
          <ContextMenuItem asChild>
            <Link href={newFileHref}>
              <Upload />
              {t("new_file_button")}
            </Link>
          </ContextMenuItem>
          <ContextMenuItem asChild>
            <Link href={newFolderHref}>
              <FolderPlus />
              {t("new_folder_button")}
            </Link>
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
