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

/**
 * ファイル一覧の余白を右クリックしたときの作成メニュー。
 *
 * 🚨 タイル上の選択を消す判定は `a,button` の祖先で行う。器そのものを判定すると、
 *    Surface が全面を覆うため「タイルの無い所」を一度も検出できない。
 *
 * 参考: `components/admin/file-tile-menu.tsx` ／ DESIGN.md §2-1
 */
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
        className="block min-h-[60svh]"
        /**
         * 🚨 受け口に最低の高さを持たせる（2026-08-20 堀池さん報告）。
         *    `block` だけだと受け口の高さが中身の高さになるので、
         *    **中身が空のときは「この場所は空です。」の 1 行ぶんしかなく**、
         *    その下の余白を右クリックするとブラウザの標準メニューが出ていた。
         *    `min-h` なので、中身が多いときは中身に合わせて伸びる。
         */
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
