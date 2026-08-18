"use client";

import Image from "next/image";
import { useState } from "react";

import { ImageLightbox } from "@/components/admin/image-lightbox";

type FilePreviewLightboxProps = {
  image: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
};

/**
 * ファイル詳細の画像を押して拡大表示する入口。
 *
 * 🚨 この部品は画像の表示と開閉だけを担当し、拡大表示の実体は `ImageLightbox` に任せる。
 * 画像の alt と寸法は呼び出し側から渡された値を使い、別のプレビュー実装を増やさない。
 *
 * 参考: `apps/studio/components/admin/image-lightbox.tsx` ／ `DESIGN.md` §0-1
 */

export function FilePreviewLightbox({ image }: FilePreviewLightboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="flex min-h-80 w-full items-center justify-center"
        onClick={() => setOpen(true)}
      >
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          unoptimized
          className="max-h-[70vh] max-w-full object-contain"
        />
      </button>
      <ImageLightbox images={[{ src: image.src, alt: image.alt }]} index={0} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
