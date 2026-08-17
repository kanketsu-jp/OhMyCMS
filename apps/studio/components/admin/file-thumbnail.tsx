"use client";

import { useState } from "react";
import Image from "next/image";
import { FileIcon } from "lucide-react";

/**
 * カードのサムネイル（正方形）。
 *
 * 🚨 **読めなかったときに、種別のアイコンへ落とす。**
 *    【base2 の実測・2026-08-17】Directus は 3 段に落としている（`card.vue:42-52`）:
 *      ① 画像 → サムネイル
 *      ② 画像でない → 種別のアイコン
 *      🚨 ③ **画像だが読めなかった**（`imgError`）→ 種別のアイコンへ
 *    私たちは ①② は持っていたが、**③が 0 件**だった（実測）。
 *    ＝ 🚨 **壊れた画像で枠が空になり、行が崩れる**（**在れば安い保険**）。
 *
 * 🚨 **正方形は `aspect-square`（＝ `aspect-ratio: 1/1`）で作る。**
 *    Directus も同じ手段（`card.vue:156`）。**画像の縦横に関わらず枠が正方形になる**ので、
 *    並びの行が崩れない。
 */
export function FileThumbnail({ id, alt }: { id: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      data-surface-exempt
      className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted"
    >
      {failed ? (
        // 🚨 空にしない。**「読めなかった」ことが分かる形**で埋める。
        <FileIcon className="size-8 text-muted-foreground" aria-hidden />
      ) : (
        <Image
          src={`/api/assets/${id}?width=200&fit=cover`}
          alt={alt}
          width={200}
          height={200}
          unoptimized
          // 🚨 これが無いと画像だけが単独でドラッグされ、こちらの荷物（ファイル ID）が載らない。
          draggable={false}
          // 🚨 落ちたら 1 度だけ切り替える。**再試行しない**——
          //    壊れている画像を何度取りに行っても、同じ結果で帯域を使うだけ。
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
