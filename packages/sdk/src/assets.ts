/**
 * **配信 URL の組み立て**（基礎モジュール）。
 *
 * 🚨 このファイルは **`react` にも `next` にも依存しない**。素の HTML から使えることが目的:
 *
 * ```html
 * <img src="${assetUrl(file, { width: 800, format: 'webp' })}" />
 * ```
 *
 * Next.js 特化のものは `@ohmycms/sdk/next` に置く。**基礎に持ち込まない**
 * （持ち込むと、素の HTML で使う人に Next.js が付いてくる）。
 *
 * 🚨 **配信は必ず `/api/assets/<id>` を通す。署名付き URL は使わない決定。**
 *   ここで直接ストレージの URL（S3 の公開 URL など）を組み立てると、
 *   **権限の判定を通らずに配信されてしまう**（AGENTS.md §3.5 と同じ話）。
 */

import type { AssetTransform, FileRecord } from "./types.js";

/** `assetUrl` が受け取れる形。id の文字列だけでも、ファイルの行そのままでも渡せる。 */
export type AssetSource = string | Pick<FileRecord, "id">;

export type AssetUrlOptions = AssetTransform & {
  /**
   * API の基点。省略すると **相対 URL**（`/api/assets/...`）を返す。
   * 同じオリジンで配信しているなら省略でよい。
   */
  baseUrl?: string;
  /** ダウンロードとして扱わせたいとき（`?download`）。 */
  download?: boolean;
};

function idOf(source: AssetSource): string {
  const id = typeof source === "string" ? source : source?.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("assetUrl: ファイルの id が必要です");
  }
  return id;
}

/**
 * ファイルの配信 URL を組み立てる。
 *
 * ```ts
 * assetUrl(file)                                  // → /api/assets/<id>
 * assetUrl(file, { width: 800, format: "webp" })  // → /api/assets/<id>?width=800&format=webp
 * assetUrl(file, { baseUrl: "https://cms.example" })
 * ```
 *
 * 🚨 **変換の指定は「あれば付ける」だけ**。値の妥当性はサーバが決める
 * （ここで独自に上限を設けると、サーバ側の仕様と二重管理になって片方が腐る）。
 */
export function assetUrl(source: AssetSource, options: AssetUrlOptions = {}): string {
  const { baseUrl, download, ...transform } = options;
  const params = new URLSearchParams();

  // 🚨 undefined と 0 を区別する。`width: 0` は指定として扱わない（意味が無いため）
  if (transform.width) params.set("width", String(transform.width));
  if (transform.height) params.set("height", String(transform.height));
  if (transform.fit) params.set("fit", transform.fit);
  if (transform.format) params.set("format", transform.format);
  if (transform.quality) params.set("quality", String(transform.quality));
  if (download) params.set("download", "1");

  const query = params.toString();
  const path = `/api/assets/${encodeURIComponent(idOf(source))}${query ? `?${query}` : ""}`;

  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

/**
 * 画像として扱ってよいファイルか。
 *
 * 🚨 **SVG は含めない。** SVG は XML の中にスクリプトを書けるため `attachment` で
 * 配信する決定（AGENTS.md §3.4）。`<img>` に入れる対象として扱うと、その決定を
 * SDK の側から崩すことになる。
 */
export function isDisplayableImage(file: Pick<FileRecord, "type"> | null | undefined): boolean {
  const type = file?.type;
  if (typeof type !== "string") return false;
  if (!type.startsWith("image/")) return false;
  return !type.includes("svg");
}
