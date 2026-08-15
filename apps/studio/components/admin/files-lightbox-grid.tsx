"use client";

import Image from "next/image";
import Link from "next/link";
import { FileIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { DRAG_FILE_MIME } from "@/components/admin/files-drag";
import { FileTileMenu } from "@/components/admin/file-tile-menu";
import { ImageLightbox } from "@/components/admin/image-lightbox";
import { useT } from "@/i18n/client";

type FileRow = {
  id: string;
  filename_download: string;
  title: string | null;
  type: string | null;
  /**
   * 🚨 拡大に要る。**無いと拡大が黙って効かない**（`image-lightbox.tsx` の注意書き参照）。
   * 画像でないものや、読めなかった画像では null。
   */
  width: number | null;
  height: number | null;
};

function isImage(file: FileRow): boolean {
  return Boolean(file.type?.startsWith("image/"));
}

function extension(file: FileRow, fallback: string): string {
  return file.filename_download.split(".").pop()?.toUpperCase() ?? fallback;
}

export function FilesLightboxGrid({ files }: { files: FileRow[] }) {
  const t = useT("files");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const imageFiles = useMemo(() => files.filter(isImage), [files]);
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

  function openImage(file: FileRow) {
    const imageIndex = imageIndexById.get(file.id);
    if (imageIndex === undefined) return;
    setIndex(imageIndex);
    setOpen(true);
  }

  return (
    <>
      {files.map((file) => {
        const label = file.title ?? file.filename_download;
        /**
         * 掴んで運べるようにする。
         * 🚨 **画像の `<img>` には `draggable={false}` が要る**（既定で画像だけが
         *    単独でドラッグされ、こちらの荷物が載らないため）。ここでは外側に持たせる。
         */
        const dragProps = {
          draggable: true,
          onDragStart: (event: React.DragEvent) => {
            // 🚨 種類を分けて載せる。素の text/plain だと、外から来たテキストと区別が付かない。
            event.dataTransfer.setData(DRAG_FILE_MIME, JSON.stringify([file.id]));
            event.dataTransfer.effectAllowed = "move";
          },
        };

        if (isImage(file)) {
          return (
            <FileTileMenu key={file.id} fileId={file.id}>
            <button
              {...dragProps}
              type="button"
              className="min-w-0 rounded-md p-3 text-left transition-colors hover:bg-muted active:bg-muted/80"
              onClick={() => openImage(file)}
            >
              <div data-surface-exempt className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
                <Image
                  src={`/api/assets/${file.id}?width=200&fit=cover`}
                  alt={label}
                  width={200}
                  height={200}
                  unoptimized
                  // 🚨 これが無いと画像だけが単独でドラッグされ、こちらの荷物（ファイル ID）が載らない。
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="mt-3 truncate text-sm font-medium">{label}</p>
              <p className="truncate text-xs text-muted-foreground">{file.filename_download}</p>
            </button>
            </FileTileMenu>
          );
        }

        return (
          <FileTileMenu key={file.id} fileId={file.id}>
          <Link
            {...dragProps}
            href={`/admin/files/${file.id}`}
            className="min-w-0 rounded-md p-3 hover:bg-muted active:bg-muted/80"
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
      <ImageLightbox images={images} index={index} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
