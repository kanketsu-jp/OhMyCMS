"use client";

import Lightbox, { type Labels } from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

import { useT } from "@/i18n/client";

type ImageLightboxProps = {
  /** 送り先の全画像。押した1枚だけでなく、その画面に出ている画像を全部渡す */
  images: { src: string; alt: string }[];
  /** 最初に見せる画像の位置。0 始まり */
  index: number;
  /** 開いているか */
  open: boolean;
  /** 閉じたときに呼ばれる */
  onClose: () => void;
};

export function ImageLightbox({ images, index, open, onClose }: ImageLightboxProps) {
  const t = useT("files");
  const labels = {
    Previous: t("lightbox_prev"),
    Next: t("lightbox_next"),
    Close: t("lightbox_close"),
    Slide: t("lightbox_slide"),
    Carousel: t("lightbox_carousel"),
    Lightbox: t("lightbox_label"),
    "Photo gallery": t("lightbox_photo_gallery"),
    "{index} of {total}": t("lightbox_slide_count"),
    "Zoom in": t("lightbox_zoom_in"),
    "Zoom out": t("lightbox_zoom_out"),
  } satisfies Labels;

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={images}
      plugins={[Zoom]}
      labels={labels}
    />
  );
}
