"use client";

import Image from "next/image";
import Link from "next/link";
import { FileIcon } from "lucide-react";
import { useMemo, useState } from "react";

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

        if (isImage(file)) {
          return (
            <button
              key={file.id}
              type="button"
              className="min-w-0 rounded-md p-3 text-left transition-colors hover:bg-muted"
              onClick={() => openImage(file)}
            >
              <div data-surface-exempt className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
                <Image
                  src={`/api/assets/${file.id}?width=200&fit=cover`}
                  alt={label}
                  width={200}
                  height={200}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="mt-3 truncate text-sm font-medium">{label}</p>
              <p className="truncate text-xs text-muted-foreground">{file.filename_download}</p>
            </button>
          );
        }

        return (
          <Link key={file.id} href={`/admin/files/${file.id}`} className="min-w-0 rounded-md p-3 hover:bg-muted">
            <div data-surface-exempt className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
              <div className="text-center text-muted-foreground">
                <FileIcon className="mx-auto mb-2 size-10" />
                <span className="text-sm font-medium">{extension(file, t("file_extension_fallback"))}</span>
              </div>
            </div>
            <p className="mt-3 truncate text-sm font-medium">{label}</p>
            <p className="truncate text-xs text-muted-foreground">{file.filename_download}</p>
          </Link>
        );
      })}
      <ImageLightbox images={images} index={index} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
