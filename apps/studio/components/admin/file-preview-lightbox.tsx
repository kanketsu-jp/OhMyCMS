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
