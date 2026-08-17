"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Folder, FileIcon } from "lucide-react";

import { DRAG_FILE_MIME } from "@/components/admin/files-drag";
import { useFormat, useT } from "@/i18n/client";
import type { FileColumn } from "@/lib/admin/files-view";

type FileRow = {
  id: string;
  filename_download: string;
  title: string | null;
  type: string | null;
  filesize: string | number | null;
  uploaded_on: string;
};

type FolderRow = {
  id: string;
  name: string;
};

/**
 * ファイル一覧の**表**表示。カード表示（`files-lightbox-grid`）と切り替えて使う。
 *
 * 🚨 **カード表示と同じ荷物で掴める**ようにしてある（`DRAG_FILE_MIME`）。
 *    表にしたら運べなくなる、では「表示を変えただけ」にならない。
 *
 * 🚨 **ライトボックスはここには無い**。表は「探す・並べる」ための見え方で、
 *    画像を大きく見るのはカード表示の役目、と割り切っている。
 *    （両方に持たせると、同じ状態を2箇所で持つことになる）
 */
export function FilesTable({
  folders,
  files,
  columns,
}: {
  folders: FolderRow[];
  files: FileRow[];
  /**
   * 出す項目。🚨 **名前も含む**（2026-08-17 から消せる。
   * `lib/admin/files-view.ts` の `ALWAYS_ON_COLUMN` に経緯）。
   */
  columns: readonly FileColumn[];
}) {
  const t = useT("files");
  const format = useFormat();
  const router = useRouter();
  const shows = (column: FileColumn): boolean => columns.includes(column);

  const size = (value: string | number | null): string => {
    if (value === null) return "—";
    const bytes = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(bytes)) return "—";
    // 🚨 桁を落として読みやすくする。**正確なバイト数が要る場面はここではない**。
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    // 🚨 幅の狭い端末で表がはみ出さないよう、**表だけを横に流す**。
    //    ページごと横に流すと、他の要素まで一緒に動いて読めなくなる。
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-xl border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {shows("name") ? <th scope="col" className="py-2 pr-4 font-medium">{t("column_name")}</th> : null}
            {shows("type") ? <th scope="col" className="py-2 pr-4 font-medium">{t("column_type")}</th> : null}
            {shows("size") ? <th scope="col" className="py-2 pr-4 font-medium">{t("column_size")}</th> : null}
            {shows("uploaded") ? <th scope="col" className="py-2 font-medium">{t("column_uploaded")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {folders.map((folder) => (
            <tr
              key={folder.id}
              // 🚨 **行のどこをクリックしても開ける**（2026-08-17）。
              //    これを入れたので、**名前の列を消せる**ようになった（Directus と同じ形）。
              // 🚨 **押した先がボタン・リンクなら遷移しない。**
              //    いまこの行にボタンは無いので、この守りは何も変えない。
              //    在るのは、**選択のチェック欄が入った瞬間に「チェックを押したら詳細へ飛ぶ」になる**から。
              //    settings の 4 つの一覧では、削除ボタンが在るので既に必要だった（`120c16c`）。
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a, input")) return;
                router.push(`/admin/files?folder=${folder.id}`);
              }}
              className="cursor-pointer border-b last:border-0 hover:bg-muted active:bg-muted/80"
            >
              {shows("name") ? (
                <td className="py-2 pr-4">
                  {/* 🚨 リンクは残す。**行のクリックだけにすると、
                      新しいタブで開く・キーボードで辿る、が全部できなくなる**。 */}
                  <Link href={`/admin/files?folder=${folder.id}`} className="flex min-w-0 items-center gap-2">
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{folder.name}</span>
                  </Link>
                </td>
              ) : null}
              {shows("type") ? <td className="py-2 pr-4 text-muted-foreground">{t("row_folder")}</td> : null}
              {shows("size") ? <td className="py-2 pr-4 text-muted-foreground">—</td> : null}
              {shows("uploaded") ? <td className="py-2 text-muted-foreground">—</td> : null}
            </tr>
          ))}
          {files.map((file) => (
            <tr
              key={file.id}
              // 🚨 カード表示と同じ形で掴める（種類も中身も同じ）。
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_FILE_MIME, JSON.stringify([file.id]));
                event.dataTransfer.effectAllowed = "move";
              }}
              // 🚨 **行のどこをクリックしても開ける**（2026-08-17）。
              //    これを入れたので、**名前の列を消せる**ようになった（Directus と同じ形）。
              // 🚨 守りの理由は上のフォルダの行と同じ（**先に入れておく**）。
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a, input")) return;
                router.push(`/admin/files/${file.id}`);
              }}
              className="cursor-pointer border-b last:border-0 hover:bg-muted active:bg-muted/80"
            >
              {shows("name") ? (
                <td className="py-2 pr-4">
                  {/* 🚨 リンクは残す。**行のクリックだけにすると、
                      新しいタブで開く・キーボードで辿る、が全部できなくなる**。 */}
                  <Link href={`/admin/files/${file.id}`} className="flex min-w-0 items-center gap-2">
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{file.title ?? file.filename_download}</span>
                  </Link>
                </td>
              ) : null}
              {shows("type") ? <td className="py-2 pr-4 text-muted-foreground">{file.type ?? "—"}</td> : null}
              {shows("size") ? <td className="py-2 pr-4 text-muted-foreground">{size(file.filesize)}</td> : null}
              {shows("uploaded") ? (
                <td className="py-2 text-muted-foreground">
                  {format.dateTime(new Date(file.uploaded_on))}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
