"use client";

import { useSyncExternalStore } from "react";
import Lightbox, { type Labels } from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

import { useT } from "@/i18n/client";

type ImageLightboxProps = {
  /**
   * 送り先の全画像。押した1枚だけでなく、その画面に出ている画像を全部渡す。
   *
   * 🚨 **width / height を必ず渡すこと。** 渡さないと **拡大が黙って効かない**
   *    （ボタンは出るが、最大倍率が 1 と評価されるので何も起きない。エラーも出ない）。
   *    先行事例（liff-agency-documents）が同じ所で止まっていた。
   *    寸法は `directus_files` に入っている（アップロード時に保存済み。EXIF の向きも反映済み）。
   *    分からないときだけ省略してよい（その画像は拡大できない、と分かった上で）。
   */
  images: { src: string; alt: string; width?: number; height?: number }[];
  /** 最初に見せる画像の位置。0 始まり */
  index: number;
  /** 開いているか */
  open: boolean;
  /** 閉じたときに呼ばれる */
  onClose: () => void;
  /** ライトボックスを管理画面の本文領域だけに出す */
  confineToContent?: boolean;
};

/** 覆う矩形を "top,left,width,height" の文字列で返す。空文字は「覆わない」。 */
function useContentBoxKey(enabled: boolean): string {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      window.addEventListener("scroll", onChange, true);
      return () => {
        window.removeEventListener("resize", onChange);
        window.removeEventListener("scroll", onChange, true);
      };
    },
    () => {
      if (!enabled) return "";
      const main = document.querySelector("main");
      if (!main) return "";
      const r = main.getBoundingClientRect();
      const top = Math.max(0, r.top);
      return [top, r.left, r.width, window.innerHeight - top].join(",");
    },
    () => "",
  );
}

/**
 * 画像を一覧として閲覧し、前後移動とズームを提供するライトボックス。
 *
 * 🚨 `images` の画像には、分かる限り `width` / `height` を渡す。欠けるとズームが黙って効かない。
 *    `portal` は表示領域を限定するときだけ props ごと渡し、空の `portal` を渡さない。
 *
 * 参考: `components/admin/files-lightbox-grid.tsx` ／ `components/admin/file-thumbnail.tsx`
 */
export function ImageLightbox({
  images,
  index,
  open,
  onClose,
  confineToContent = false,
}: ImageLightboxProps) {
  const t = useT("files");
  const contentBoxKey = useContentBoxKey(confineToContent);
  const [top = 0, left = 0, width = 0, height = 0] = contentBoxKey.split(",").map(Number);
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

  /**
   * 🚨 **`portal={undefined}` を渡してはいけない。**
   *
   * この部品は既定の設定を props で上書きするので、**明示的に `undefined` を渡すと
   * `portal` そのものが消える**。すると中の `Portal` が `{ root, container }` を
   * 分解するところで落ちる。実測（2026-08-17）:
   *   `Uncaught TypeError: Cannot read properties of undefined (reading 'root')`
   *   ライトボックスは**開かない**（`[class*="yarl"]` が 0 件のまま）。
   *
   * 🚨 **一覧では起きない。** 一覧は `portal` を渡す側なので平気で、
   *    壊れるのは**渡さない側の画面（ファイルの詳細）だけ**だった。
   *    ＝ **自分が直した画面を見ているかぎり気づけない形の退行**。
   *    🟢 対照でそれを掴んだ: HEAD の版に戻すと詳細ページは開き（yarl 0 → 24）、
   *    こちらの版では開かなかった（0 のまま）。
   *
   * → **渡さないときは props ごと出さない。**
   */
  const portalProps = contentBoxKey
    ? { portal: { container: { style: { top, left, width, height, right: "auto", bottom: "auto" } } } }
    : {};

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={images}
      plugins={[Zoom]}
      labels={labels}
      {...portalProps}
    />
  );
}
