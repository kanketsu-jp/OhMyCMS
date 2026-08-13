/**
 * `<Image>` — **OhMyCMS のファイルを next/image で出すためのラッパー。**
 *
 * オーナー指示（2026-08-13）:
 * > shadcn みたいにそのまま使えるようなものにする。たとえば Images コンポーネントみたいなのを
 * > 用意して、クラスの指定などもできる。中身は image のラッパーで、placeholder などが
 * > 勝手に適応されるもの。
 *
 * ```tsx
 * import { Image } from "@ohmycms/sdk/next";
 *
 * <Image file={file} className="rounded-lg" />
 * ```
 *
 * 🚨 **このファイルだけが `react` / `next` に依存してよい。**
 *   基礎（`@ohmycms/sdk`）は素の HTML からも使う約束なので、あちらへ持ち込まない。
 *   機械検査: `bun --filter @ohmycms/sdk check:framework-free`
 *
 * 設計の約束（司令塔経由の指示）:
 *   ・**`className` を受け取って通す**。見た目は使う側が決める（SDK が決めない）
 *   ・**壊れたときに本体を落とさない**。`blur_data_url` が無ければ**ぼかしを諦めて普通に出す**
 *   ・**配信は必ず `/api/assets/<id>`**（署名付き URL は使わない決定）。
 *     ストレージの URL を組み立てない＝**権限の判定を必ず通す**
 *   ・**型は1箇所**。`FileRecord` は基礎の型をそのまま使う（二重定義しない）
 */

import NextImage, { type ImageProps as NextImageProps } from "next/image";
import type { JSX } from "react";

import { assetUrl, isDisplayableImage } from "../assets.js";
import type { FileRecord } from "../types.js";

/** `<Image>` に渡せるファイル。行そのままでも、必要な列だけでも渡せる。 */
export type ImageFile = Pick<FileRecord, "id"> &
  Partial<Pick<FileRecord, "type" | "width" | "height" | "blur_data_url" | "title">>;

export type ImageProps = Omit<NextImageProps, "src" | "alt" | "width" | "height" | "loader"> & {
  /** OhMyCMS のファイル。`/api/files` が返す行をそのまま渡せる。 */
  file: ImageFile;
  /**
   * 代替テキスト。省略するとファイルの `title` を使い、それも無ければ空文字。
   * 🚨 空文字は「装飾画像」の意味になる。**中身のある画像には必ず渡すこと。**
   */
  alt?: string;
  /** API の基点。同じオリジンで配信しているなら不要。 */
  baseUrl?: string;
  /** 明示したいとき。省略するとファイルの寸法を使う。 */
  width?: number;
  height?: number;
};

/**
 * ファイルを `next/image` で描画する。
 *
 * 🚨 **`blur_data_url` が無いときは `placeholder` を付けない。**
 *   `placeholder="blur"` を付けて `blurDataURL` を渡さないと **next/image は例外を投げる**。
 *   ぼかしは飾りなので、**飾りのために本体を落とさない**（今日フォントで踏んだのと同じ形）。
 */
export function Image({
  file,
  alt,
  baseUrl,
  width,
  height,
  ...rest
}: ImageProps): JSX.Element | null {
  // 🚨 SVG は `attachment` で配信される決定（AGENTS.md §3.4）。`<img>` に入れる対象にしない。
  //   ここで出そうとしても**ブラウザはダウンロードとして扱う**ので、静かに何も出さない方が正しい。
  if (!isDisplayableImage(file as Pick<FileRecord, "type">)) return null;

  const resolvedWidth = width ?? file.width ?? undefined;
  const resolvedHeight = height ?? file.height ?? undefined;
  const blur = file.blur_data_url ?? null;

  // 🚨 名前の読み替えはここだけ（API と SDK は `blur_data_url`、next/image は `blurDataURL`）。
  //   storage と合意した三段の一番外側。変換が1箇所に閉じているので取り違えが起きない。
  const placeholder = blur ? ({ placeholder: "blur", blurDataURL: blur } as const) : {};

  // 寸法が無いと next/image はレイアウトを決められない。`fill` を使うなら親が決める。
  const sizing =
    rest.fill || (resolvedWidth && resolvedHeight)
      ? { width: resolvedWidth, height: resolvedHeight }
      : { width: resolvedWidth, height: resolvedHeight };

  return (
    <NextImage
      src={assetUrl(file, { baseUrl })}
      alt={alt ?? file.title ?? ""}
      {...sizing}
      {...placeholder}
      {...rest}
    />
  );
}
