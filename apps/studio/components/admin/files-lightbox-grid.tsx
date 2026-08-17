"use client";

import Link from "next/link";
import { FileIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { DRAG_FILE_MIME } from "@/components/admin/files-drag";
import { FileThumbnail } from "@/components/admin/file-thumbnail";
import { FileTileMenu } from "@/components/admin/file-tile-menu";
import { ImageLightbox } from "@/components/admin/image-lightbox";
import { useRightPanel } from "@/components/admin/right-panel";
import { useT } from "@/i18n/client";
import {
  clearSelection,
  setPreviewableIds,
  setSelection,
  usePreviewRequest,
  useSelectedFiles,
  type SelectedFile,
} from "@/lib/admin/files-selection";
import { cn } from "@/lib/utils";

/**
 * 一覧が扱うファイル 1 件。
 *
 * 🚨 **`lib/admin/files-selection.ts` の `SelectedFile` と同じ形にしてある**
 *    （右サイドバーへ渡すのがこの型そのものなので、2 つ書くと片方だけ直る）。
 *
 * 🚨 **`width` / `height` を落とさないこと。** 無いと**拡大が黙って効かない**
 *    （ボタンは出るが最大倍率が 1 と評価される。エラーも出ない。
 *    `image-lightbox.tsx` の注意書きに実例が残っている）。
 *    画像でないものや、読めなかった画像では null。
 */
type FileRow = SelectedFile;

type TileEvent = {
  detail: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
};

type FileDragProps = {
  id: string;
};

function isImage(file: FileRow): boolean {
  return Boolean(file.type?.startsWith("image/"));
}

function extension(file: FileRow, fallback: string): string {
  return file.filename_download.split(".").pop()?.toUpperCase() ?? fallback;
}

function fileDragProps(file: FileDragProps) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      // 🚨 種類を分けて載せる。素の text/plain だと、外から来たテキストと区別が付かない。
      event.dataTransfer.setData(DRAG_FILE_MIME, JSON.stringify([file.id]));
      event.dataTransfer.effectAllowed = "move";
    },
  };
}

export function FilesLightboxGrid({ files }: { files: FileRow[] }) {
  const t = useT("files");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [closedPreviewNonce, setClosedPreviewNonce] = useState<number | null>(null);
  const selectedFiles = useSelectedFiles();
  const previewRequest = usePreviewRequest();
  const lastClickedIdRef = useRef<string | null>(null);
  const panel = useRightPanel();
  const imageFiles = useMemo(() => files.filter(isImage), [files]);
  const imageIdsKey = useMemo(() => imageFiles.map((file) => file.id).join("\u0000"), [imageFiles]);
  const images = useMemo(
    () =>
      imageFiles.map((file) => ({
        src: `/api/assets/${file.id}`,
        alt: file.title ?? file.filename_download,
        // 🚨 null のときは渡さない（0 を渡すと「0px の画像」として扱われる）。
        ...(file.width && file.height ? { width: file.width, height: file.height } : {}),
      })),
    [imageFiles],
  );
  const imageIndexById = useMemo(
    () => new Map(imageFiles.map((file, imageIndex) => [file.id, imageIndex])),
    [imageFiles],
  );
  const fileById = useMemo(
    () => new Map(files.map((file) => [file.id, file])),
    [files],
  );
  const selectedIds = useMemo(
    () => new Set(selectedFiles.map((file) => file.id)),
    [selectedFiles],
  );
  const previewImageIndex = (() => {
    if (!previewRequest) return null;
    const file = fileById.get(previewRequest.id);
    if (!file || !isImage(file)) return null;
    return imageIndexById.get(file.id) ?? null;
  })();
  const previewOpen =
    previewRequest !== null &&
    previewImageIndex !== null &&
    closedPreviewNonce !== previewRequest.nonce;
  const lightboxIndex = previewOpen ? previewImageIndex : index;
  const lightboxOpen = previewOpen || open;

  useEffect(() => {
    setPreviewableIds(imageIdsKey ? imageIdsKey.split("\u0000") : []);
  }, [imageIdsKey]);

  useEffect(() => {
    return () => {
      clearSelection();
      setPreviewableIds([]);
    };
  }, []);

  function openImage(file: FileRow) {
    const imageIndex = imageIndexById.get(file.id);
    if (imageIndex === undefined) return;
    setIndex(imageIndex);
    setOpen(true);
  }

  /**
   * 選択を差し替える。
   *
   * 🚨 **1 件でも選ばれたら、右サイドバーを開く**（堀池・2026-08-17 AJ1 原文:
   *    「ファイルを選択したら、閉じていても右サイドバーを出すし、ファイル詳細も出す。」）。
   *    開く役は**ここ**にある。理由: 右サイドバーの中身は**開いている間しか描かれない**ので、
   *    閉じているあいだ、向こう側には選択を見ている人が 1 人も居ない。
   *    ＝ 「選ばれた」を知っているのは一覧だけなので、**一覧が開ける**。
   *    🚨 節（「ファイルの詳細」）を開くのは右サイドバー側（L2）の仕事。
   *       こちらは `useSelectedFiles()` に流すだけで、節の開閉には触らない。
   * 🚨 効果（useEffect）の中ではなく、**押した手の中で呼ぶ**
   *    （この repo の lint は効果の中の同期 setState を error にする）。
   */
  function replaceSelection(next: readonly FileRow[]): void {
    if (next.length === 0) {
      clearSelection();
      return;
    }
    setSelection(next);
    panel.open();
  }

  function toggle(file: FileRow): void {
    const next = selectedIds.has(file.id)
      ? selectedFiles.filter((selected) => selected.id !== file.id)
      : [...selectedFiles, file];
    lastClickedIdRef.current = file.id;
    replaceSelection(next);
  }

  function selectRange(file: FileRow): void {
    const startId = lastClickedIdRef.current;
    if (!startId) {
      replaceSelection([file]);
      return;
    }
    const startIndex = files.findIndex((one) => one.id === startId);
    const endIndex = files.findIndex((one) => one.id === file.id);
    if (startIndex === -1 || endIndex === -1) {
      replaceSelection([file]);
      return;
    }
    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const byId = new Map(selectedFiles.map((selected) => [selected.id, selected]));
    for (const selected of files.slice(from, to + 1)) byId.set(selected.id, selected);
    replaceSelection([...byId.values()]);
  }

  function selectFromEvent(event: TileEvent, file: FileRow): void {
    if (event.metaKey || event.ctrlKey) return;
    if (event.detail > 1) return;
    event.preventDefault();
    if (event.shiftKey) {
      selectRange(file);
      return;
    }
    toggle(file);
  }

  useEffect(() => {
    const clearOnEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      clearSelection();
    };
    document.addEventListener("keydown", clearOnEscape);
    return () => document.removeEventListener("keydown", clearOnEscape);
  }, []);

  return (
    <div className="contents">
      {files.map((file) => {
        const label = file.title ?? file.filename_download;
        /**
         * 掴んで運べるようにする。
         * 🚨 **画像の `<img>` には `draggable={false}` が要る**（既定で画像だけが
         *    単独でドラッグされ、こちらの荷物が載らないため）。ここでは外側に持たせる。
         */
        const dragProps = fileDragProps(file);
        const selected = selectedIds.has(file.id);
        const tileClassName = cn(
          "min-w-0 rounded-md p-3 transition-colors hover:bg-muted active:bg-muted/80",
          selected && "ring-2 ring-ring",
        );

        if (isImage(file)) {
          return (
            <FileTileMenu key={file.id} fileId={file.id}>
            <button
              {...dragProps}
              type="button"
              data-selected={selected ? "true" : undefined}
              /* 🚨 **`aria-selected` は使えない。** `role=button`（`<button>` の暗黙の役）は
                 この属性を持てず、lint が名指しで警告した（`jsx-a11y/role-supports-aria-props`）。
                 選んでいる状態を読み上げに伝えるのは **`aria-pressed`**（押している/いない）。
                 🚨 **「見える」「押せる」「読み上げられる」は 3 つ別の問い。**
                 見た目のリング（`ring-2`）だけ足して読み上げを足さないと、
                 目で見ない人には**選択が起きていないのと同じ**になる。 */
              aria-pressed={selected}
              /* 🚨 `hover:` には必ず `active:` を対で置く（堀池さん指示・2026-08-15）。
                 **タッチの端末には hover がありません**（実測: sp で
                 `matchMedia("(hover: hover)")` → false / `(pointer: coarse)` → true）。
                 つまり **SP では active が唯一の手応え**になります。
                 🚨 だから **hover と同じ濃さにしない**——`/80` と一段濃くしてある。
                 同じ濃さだと、押しても「触れただけ」と見分けが付きません。
                 🚨 **SP の実機で押した手応えは、まだ測っていません**（本来の目的はそこ）。 */
              className={cn(tileClassName, "text-left")}
              onClick={(event) => selectFromEvent(event, file)}
              onDoubleClick={() => openImage(file)}
            >
              <FileThumbnail id={file.id} alt={label} />
              <p className="mt-3 truncate text-sm font-medium">{label}</p>
              <p className="truncate text-xs text-muted-foreground">{file.filename_download}</p>
            </button>
            </FileTileMenu>
          );
        }

        /**
         * 🚨 **画像でないタイルは、選択を読み上げに伝えられていない**（未解決・2026-08-17）。
         *    `aria-selected` は `role=link` が持てない属性で（lint が名指しで警告する）、
         *    `aria-pressed` もリンクには載らない（押す部品ではないため）。
         *    正しく伝えるには並び全体を `role="listbox"`・各タイルを `role="option"` にする——
         *    それは**並びの器（`page.tsx` の grid）を作り替える話で、フォルダのタイルも巻き込む**ので、
         *    この項目では手を付けない。
         *    🚨 **見た目のリングは出るが、目で見ない人にはこのタイルの選択が届かない。**
         *    画像のタイル（`<button>`）は `aria-pressed` で伝えている。差は司令塔へ上げた。
         */
        return (
          <FileTileMenu key={file.id} fileId={file.id}>
          <Link
            {...dragProps}
            href={`/admin/files/${file.id}`}
            data-selected={selected ? "true" : undefined}
            className={tileClassName}
            onClick={(event) => selectFromEvent(event, file)}
          >
            <div data-surface-exempt className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
              <div className="text-center text-muted-foreground">
                <FileIcon className="mx-auto mb-2 size-10" />
                <span className="text-sm font-medium">{extension(file, t("file_extension_fallback"))}</span>
              </div>
            </div>
            <p className="mt-3 truncate text-sm font-medium">{label}</p>
            <p className="truncate text-xs text-muted-foreground">{file.filename_download}</p>
          </Link>
          </FileTileMenu>
        );
      })}
      <ImageLightbox
        images={images}
        index={lightboxIndex}
        open={lightboxOpen}
        onClose={() => {
          if (previewRequest) setClosedPreviewNonce(previewRequest.nonce);
          setOpen(false);
        }}
        confineToContent
      />
    </div>
  );
}
