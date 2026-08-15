"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Folder, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { DRAG_FILE_MIME } from "@/components/admin/files-drag";
import { FolderLabelsMenu } from "@/components/admin/folder-labels-menu";
import { useT } from "@/i18n/client";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
  color: string | null;
};

/**
 * 色の名前を、実際のクラスへ写す。
 * 🚨 **`text-${color}-500` のように組み立てない。** Tailwind は**書かれた文字列を見て**
 *    CSS を作るので、組み立てた名前は**削られて色が出ない**（ビルドしないと分からない）。
 *    ここに全部書き出しておけば、使われていることが文字として見える。
 */
const FOLDER_COLOR_CLASS: Record<string, string> = {
  slate: "text-slate-500",
  red: "text-red-500",
  amber: "text-amber-500",
  emerald: "text-emerald-500",
  sky: "text-sky-500",
  violet: "text-violet-500",
};
const FOLDER_COLOR_NAMES = Object.keys(FOLDER_COLOR_CLASS);

function messageFrom(payload: unknown, status: number, fallback: string): string {
  if (status === 409) return fallback;
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}

export function FolderGrid({ folders }: { folders: FolderRow[] }) {
  const t = useT("folders");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const remove = useSubmitOnce(async (id: string) => {
    setError(null);
    const response = await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(
        messageFrom(
          payload,
          response.status,
          response.status === 409
            ? t("error_folder_not_empty")
            : response.status === 403
              ? t("error_forbidden")
              : t("error_delete_failed"),
        ),
      );
      return;
    }
    router.refresh();
  }, (id) => id);

  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const recolor = useSubmitOnce(
    async (id: string, color: string | null) => {
      const response = await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ color }),
      });
      if (!response.ok) {
        toast.error(t("color_failed"));
        return;
      }
      router.refresh();
    },
    (id) => id,
  );

  /**
   * 掴んできたファイルをこのフォルダへ入れる。
   * 🚨 サービス層は変えていない。`updateFile` は既に `folder` の変更を許しているので、
   *    既存の `PATCH /api/files/<id>` をそのまま叩く。
   */
  const moveInto = async (folderId: string, fileIds: string[]) => {
    let moved = 0;
    let failed = 0;
    for (const fileId of fileIds) {
      try {
        const response = await fetch(`/api/files/${fileId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ folder: folderId }),
        });
        if (response.ok) moved += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    // 🚨 何件動いて何件落ちたかを出す。まとめて「失敗」にすると、**一部だけ動いた状態**が見えなくなる。
    if (moved > 0) toast.success(t("moved", { count: String(moved) }));
    if (failed > 0) toast.error(t("move_failed", { count: String(failed) }));
    if (moved > 0) router.refresh();
  };

  const carriesFile = (event: React.DragEvent): boolean =>
    Array.from(event.dataTransfer.types).includes(DRAG_FILE_MIME);

  return (
    <div className="contents">
      {error ? <p className="col-span-full text-sm text-destructive">{error}</p> : null}
      {folders.map((folder) => (
        <div
          key={folder.id}
          // 🚨 ここで受けるのは**画面内から掴んできたファイルだけ**。外から来たファイル
          //    （アップロード）は上位の層が受けるので、種類で見分けて棲み分ける。
          onDragOver={(event) => {
            if (!carriesFile(event)) return;
            event.preventDefault();
            // 🚨 上位のドロップ層まで伝わると、アップロードと二重に反応する。
            event.stopPropagation();
            setDropTarget(folder.id);
          }}
          onDragLeave={() => setDropTarget((current) => (current === folder.id ? null : current))}
          onDrop={(event) => {
            if (!carriesFile(event)) return;
            event.preventDefault();
            event.stopPropagation();
            setDropTarget(null);
            const raw = event.dataTransfer.getData(DRAG_FILE_MIME);
            const ids = raw ? (JSON.parse(raw) as string[]) : [];
            if (ids.length > 0) void moveInto(folder.id, ids);
          }}
          className={
            dropTarget === folder.id
              ? "group/tile relative min-w-0 rounded-md p-3 outline-2 outline-offset-[-2px] outline-dashed outline-ring"
              : "group/tile relative min-w-0 rounded-md p-3 hover:bg-muted active:bg-muted/80"
          }
        >
          <Link href={`/admin/files?folder=${folder.id}`} className="block min-w-0 pr-10">
            <Folder
              className={
                folder.color && FOLDER_COLOR_CLASS[folder.color]
                  ? `mb-3 size-10 ${FOLDER_COLOR_CLASS[folder.color]}`
                  : "mb-3 size-10 text-muted-foreground"
              }
            />
            <p className="truncate text-sm font-medium">{folder.name}</p>
          </Link>
          <div className="absolute right-2 top-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("actions_label")}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  {/* 🚨 開いた人の分だけ取りに行く（一覧の描画で N+1 にしない）。 */}
                  <FolderLabelsMenu folderId={folder.id} />
                  {/* 🚨 色は「選ぶ」ものなので、1項目に押し込まず並べる。
                      文字にすると6行になり、削除より目立ってしまう。 */}
                  <div className="flex flex-wrap gap-1 px-2 py-1.5">
                    {FOLDER_COLOR_NAMES.map((name) => (
                      <button
                        key={name}
                        type="button"
                        aria-label={t(`color_${name}`)}
                        title={t(`color_${name}`)}
                        aria-pressed={folder.color === name}
                        disabled={recolor.isPending(folder.id)}
                        onClick={() => void recolor.run(folder.id, folder.color === name ? null : name)}
                        className={`size-5 rounded-full ${FOLDER_COLOR_CLASS[name]} bg-current ${
                          folder.color === name ? "ring-2 ring-offset-1 ring-ring" : ""
                        }`}
                      />
                    ))}
                  </div>
                  <DropdownMenuItem
                    variant="destructive"
                    className="text-destructive"
                    disabled={remove.isPending(folder.id)}
                    onClick={() => void remove.run(folder.id)}
                  >
                    <Trash2 />
                    {t("delete_button")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
