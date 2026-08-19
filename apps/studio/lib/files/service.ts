import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { Knex } from "knex";
import sharp from "sharp";
import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { applyFilter, type FilterObject } from "@/lib/items/filter";
import type { SchemaOverview } from "@/lib/items/relations";
import {
  resolvePermission,
  type PermissionAction,
  type PermissionResolution,
} from "@/lib/permissions/resolve";
import { ApiError, isApiError } from "@/lib/schema/errors";
import { maxUploadBytes, maxUploadMb } from "@/lib/files/upload-limit";
import { getSchemaOverview } from "@/lib/schema/introspect";
import type { RelationMeta } from "@/lib/schema/models";
// 🚨 `removeLabelsForTarget` の import を外した（2026-08-16）。
//    削除がソフトになり、**割り当てを消さなくなった**ため。
//    消すのは 90 日後の掃除の側（そこで要るなら、そこで import すること）。
import { authorizeTarget } from "@/lib/labels/service";
import { liveRows } from "@/lib/files/live";
import { getStorage, getStorageByName } from "@/lib/storage";
import type { StorageDriver } from "@/lib/storage/driver";
import { getSettings } from "@/lib/settings/service";

// 🚨 上限は `lib/files/upload-limit.ts` が唯一の出どころ（そこに理由を書いてある）。
//    ここに数字を書き戻さないこと。**Next の受け口の上限とも、同じ値から配っている。**
//    2026-08-16 まで 50MB を直書きしていたが、**Next の受け口が既定 10MB だったので
//    この判定へは一度も到達していなかった**（＝ 死んだ上限）。
// sharp の既定値（268,402,689 px）より先に断る。通常の 4000x3000 px は通しつつ、
// 変換時のデコードによるメモリ消費が過大にならないよう、画素数を 4000 万に制限する。
const MAX_IMAGE_PIXELS = 40_000_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const MIME_BY_EXT: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

const SUPPORTED_TRANSFORM_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

// **守り手: この 2 つの集合（MIME と拡張子）と、下の `contentDisposition` の組み立て。**
// 画面まで届いていることは `app/api/assets/[id]/route.ts` が
// `headers.set("Content-Disposition", asset.contentDisposition)` で載せている（ここが無いと無意味）。
// 🚨 2026-08-15 に HTTP で実測:
//   evil.svg / evil.html / **SVG を image/png と偽ったもの** → 3 つとも attachment + nosniff
//   🟢 対照(+) ふつうの PNG → **Content-Disposition が付かない**（＝全部に付けているのではない）
const DANGEROUS_INLINE_MIME = new Set(["text/html", "image/svg+xml"]);

/**
 * 🚨 拡張子でも危険判定する。
 * 申告 MIME と拡張子が食い違うと inferContentType が application/octet-stream にするため、
 * MIME だけ見ていると「evil.html を text/plain と偽る」で attachment を回避できてしまう。
 */
const DANGEROUS_INLINE_EXT = new Set([
  ".html", ".htm", ".xhtml", ".svg", ".xml", ".mhtml",
]);

/**
 * アップロード時に作る「配信用の圧縮版」の設定。
 *
 * 🚨 **元のファイルは消さない。** 圧縮の設定（品質・形式・長辺）は後で必ず変わるし、
 *    「圧縮しすぎた」は見て気づくまで時間がかかる。**元があれば作り直せる。**
 *    「後から元を捨てる」は選べるが「捨てた元を取り戻す」は選べない。
 *
 * 実測（4000x3000 の画像・ffmpeg mandelbrot の合成画像）:
 *   PNG  4554KB → webp q80 長辺2000 で **109KB（2.4%）** 214ms
 *   JPEG 1433KB → 同上           **110KB（7.7%）** 149ms
 *   avif q50 は 78KB とさらに小さいが **2.6倍遅い**ので既定にしない。
 */
const COMPRESS_MAX_DIMENSION = 2000;
const COMPRESS_QUALITY = 80;

/**
 * 圧縮の対象にする形式（sharp が読んだ実際の形式で判定する。申告 MIME を信じない）。
 * 🚨 **svg は入れない。** §3.4 で attachment を強制している当のファイルを
 *    サーバ側でラスタライズすることになるため（外部参照を辿る経路ができる）。
 */
const COMPRESSIBLE_FORMAT = new Set(["jpeg", "png", "webp", "avif", "gif", "tiff"]);

/** 配信用の圧縮版のキー。元と同じ `<uuid>/` の下に置くので、削除は今までどおり前方一致で消える。 */
function compressedKey(id: string): string {
  return `${id}/compressed.webp`;
}

/**
 * 配信用の圧縮版を作る。作れない・作る意味がないときは **null**（＝元をそのまま使う）。
 *
 * 🚨 実測で見つけた、壊れやすい点をすべてここで塞いでいる:
 *  1. **animated: true で読む**。付けないとアニメ GIF が **10コマ → 1コマ**になる（実測）
 *  2. **必ず .rotate() を通す**。付けないと EXIF の向き情報が出力時に消え、**横倒しで固定**される（実測）
 *  3. **出力は WebP。JPEG にしない**。JPEG は**透過が消える**（実測。webp / avif は残る）
 *  4. **元より小さくならなければ使わない**。既に webp の小さい画像は 158B → 158B で得がなかった（実測）
 */
export async function compressImage(
  body: Buffer,
  format: string | null,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!format || !COMPRESSIBLE_FORMAT.has(format)) return null;
  try {
    const compressed = await sharp(body, { animated: true })
      .rotate()
      .resize({
        width: COMPRESS_MAX_DIMENSION,
        height: COMPRESS_MAX_DIMENSION,
        fit: "inside",
        // 🚨 小さい画像を引き伸ばさない（画質を落として容量だけ増える）。
        withoutEnlargement: true,
      })
      .webp({ quality: COMPRESS_QUALITY })
      .toBuffer();
    if (compressed.byteLength >= body.byteLength) return null;
    return { buffer: compressed, contentType: "image/webp" };
  } catch {
    // 🚨 圧縮は「配信を軽くする飾り」。失敗してもアップロードは成功させる。
    return null;
  }
}

/**
 * 読み込み中に出す「ぼかした極小画像」を作る。作れないときは **null**。
 *
 * 🚨 **なぜ事前に作るか**: 読み込み中に出すものなので、**その時点で無いと意味がない**。
 *    オンデマンドだと取りに行く時間が発生し、プレースホルダの意味が消える。
 *    （サムネは 200px で 16ms なのでオンデマンドのままでよい。実測して確かめた）
 *
 * 🚨 **BlurHash を使わない**: 文字列は短い（20-30バイト）が、**クライアントにデコードの
 *    ライブラリが要る**。極小 WebP の base64 は **142B / dataUrl 215文字**（実測）で、
 *    差は数百バイトしかなく、`<img src="data:…">` でそのまま出せる。**追加依存ゼロ**。
 *
 * 出力は `data:image/webp;base64,…`。next/image の `blurDataURL` にそのまま渡せる。
 */
const BLUR_DIMENSION = 20;
const BLUR_QUALITY = 50;

export async function createBlurDataUrl(
  body: Buffer,
  format: string | null,
): Promise<string | null> {
  // 🚨 圧縮と同じ判定を使う（SVG を除く画像だけ）。ここを別々にすると片方だけ穴が開く。
  if (!format || !COMPRESSIBLE_FORMAT.has(format)) return null;
  try {
    const blurred = await sharp(body)
      // 🚨 向きを反映する。付けないと、ぼかしだけ横倒しになって本画像と入れ替わる瞬間に飛ぶ。
      .rotate()
      .resize(BLUR_DIMENSION, BLUR_DIMENSION, { fit: "inside" })
      .blur(1)
      .webp({ quality: BLUR_QUALITY })
      .toBuffer();
    return `data:image/webp;base64,${blurred.toString("base64")}`;
  } catch {
    // 🚨 飾りのために本体を落とさない。生成に失敗してもアップロードは成功させる。
    return null;
  }
}

/**
 * フォルダに付けられる色。**画面と API で同じ集合を使う**ため、ここが正本。
 * 🚨 増やすときは**辞書（`folders.color_*`）も一緒に足す**。片方だけ増やすと、
 *    選べるのに名前が出ない（または名前だけあって選べない）状態になる。
 */
/**
 * 🚨 **生きている行だけを見る入口。ここを通らない問い合わせを書かないこと。**
 *
 * 削除は「消す」ではなく「印を立てる」（`deleted_at`）に変わった（283 A・2026-08-16）。
 * そのため **`db("directus_files")` を素で書くと、消したはずのものが画面に出る。**
 * 🚨 手で 13 箇所に `whereNull` を書く形にしない——**必ずどこかが漏れる**
 *    （schema が items 側で同じ判断をしている）。
 *
 * 🚨 **insert はここを通さない**（新しい行に「生きている」条件は無い）。
 * 🚨 **90 日の掃除だけは、消えた行を見る必要がある**ので、そこは素の `db(...)` を使い、
 *    その場に理由を書くこと。
 */
// 🚨 判定そのものは `lib/files/live.ts` に置いてある（`lib/labels/service.ts` も同じ判定が要り、
//    ここに置くと **循環 import** になるため。理由はそのファイルに書いた）。
//    ここは**型を当てるだけ**の薄い包み。
function liveFiles() {
  return liveRows<FileRow>("directus_files");
}
function liveFolders() {
  return liveRows<FolderRow>("directus_folders");
}

export const FOLDER_COLORS = new Set(["slate", "red", "amber", "emerald", "sky", "violet"]);

type ResizeFit = "cover" | "contain" | "inside" | "outside";

type ImageTransformLimits = {
  inputMaxDimension: number;
  outputMaxDimension: number;
  maxOperations: number;
  maxConcurrency: number;
  timeoutMs: number;
};

const HARD_INPUT_MAX_DIMENSION = 6000;
const HARD_OUTPUT_MAX_DIMENSION = 3000;

function positiveSetting(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function imageTransformLimits(): Promise<ImageTransformLimits> {
  const settings = await getSettings();
  return {
    inputMaxDimension: Math.min(positiveSetting(settings.image_input_max_dimension, HARD_INPUT_MAX_DIMENSION), HARD_INPUT_MAX_DIMENSION),
    outputMaxDimension: Math.min(positiveSetting(settings.image_output_max_dimension, HARD_OUTPUT_MAX_DIMENSION), HARD_OUTPUT_MAX_DIMENSION),
    maxOperations: positiveSetting(settings.image_max_operations, 5),
    maxConcurrency: positiveSetting(settings.image_max_concurrency, 25),
    timeoutMs: positiveSetting(settings.image_transform_timeout_ms, 7500),
  };
}

let activeTransforms = 0;
const transformWaiters: Array<() => void> = [];

async function withTransformSlot<T>(limit: number, operation: () => Promise<T>): Promise<T> {
  if (activeTransforms >= limit) {
    await new Promise<void>((resolve) => transformWaiters.push(resolve));
  }
  activeTransforms += 1;
  try {
    return await operation();
  } finally {
    activeTransforms -= 1;
    transformWaiters.shift()?.();
  }
}

type FileRow = {
  id: string;
  storage: string;
  filename_disk: string | null;
  filename_download: string;
  title: string | null;
  type: string | null;
  folder: string | null;
  uploaded_by: string | null;
  uploaded_on: string;
  modified_by: string | null;
  modified_on: string;
  charset: string | null;
  filesize: string | number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  embed: string | null;
  description: string | null;
  location: string | null;
  tags: string | null;
  metadata: unknown;
  focal_point_x: number | null;
  focal_point_y: number | null;
  /** 読み込み中に出すぼかし画像（data:image/webp;base64,…）。画像でないもの・SVG では null。 */
  blur_data_url: string | null;
  /** 配信用の圧縮版のキー。null なら圧縮版なし（元をそのまま配信する）。 */
  compressed_key: string | null;
  is_public: boolean;
  visibility: "public" | "link" | "private";
  public_token: string;
  /**
   * ゴミ箱に入れた時刻。**null なら生きている**（283 A・2026-08-16）。
   * 🚨 読むときは必ず `liveFiles()` を通す。素の `db("directus_files")` を書かない。
   */
  deleted_at: string | null;
};

/**
 * API で返してよい形。
 *
 * 🚨 **`compressed_key` を外している。** 保管先の中のキー構造（どこに何が置いてあるか）は
 *    利用者に要らない情報で、出すと**バケットの中身の当て方の手がかり**になる。
 *    ぼかし（blur_data_url）は表示のための公開情報なので、そのまま返してよい。
 *
 * **守り手: `toPublicFile`（すぐ下）。`delete` で実際に落とす。**
 *    外へ出る経路は `uploadFile` / `listFiles` / `getFile` / `updateFile` の 4 つで、
 *    **すべて `toPublicFile` を通る**（2026-08-15 に返り値の型と return を全部確認）。
 *    🚨 **型（`Omit`）は守り手ではない。** 型は「そう宣言した」だけで、
 *    実際に落としているのは `delete`。`as` で黙らせれば型は素通りする。
 *    🚨 API ルートが `directus_files` を直接読むとこの守りを迂回できる。
 *    2026-08-15 時点で `app/` `components/` に直接読む経路は無い（ヒットはコメント 2 件のみ）。
 */
/**
 * 🚨 **印（brand）。`toPublicFile` を通らないと `PublicFileRow` を作れなくするためだけに在る。**
 *
 * これが無いと `Omit` は**宣言でしかない**——新しい出口を足す人が
 * `Promise<PublicFileRow>` と書いて生の行をそのまま返しても、**構造が合うので型が通る**
 * （`FileRow` は `PublicFileRow` の全項目を持っているため）。
 * 印を付けると**素の行では型が合わなくなる**ので、`toPublicFile` を通すか、
 * `as PublicFileRow` と**自分の手で書く**しかない。
 *
 * 🚨 **印だけでは足りない。** 2026-08-15 に 4 通り試したところ、印が止めたのは
 * 「`PublicFileRow` と名乗って生の行を返す」形**だけ**で、`as` での表明・山括弧での表明・
 * **生の行の型を名乗る**・**返り値の型を書かない** は**全部 tsc を素通りした**。
 * 残りは `scripts/check-raw-row-exports.mjs` が止める（lefthook に載せてある）。
 * 🚨 山括弧を探すとき `<PublicFileRow>` で grep しないこと——**`Promise<PublicFileRow>` まで拾う**。
 *
 * 🚨 **symbol のキーは JSON に出ない**（`JSON.stringify` / `Object.keys` / `Response.json` の
 * どれも symbol キーを無視する。2026-08-15 に実測。文字列キーの `__brand` にすると漏れる）。
 * だから応答の中身は 1 バイトも変わらない。
 */
declare const publicFileBrand: unique symbol;

// 🚨 `deleted_at` も外へ出さない（2026-08-16）。**いま読む側が誰も居ない**ので、
//    出すと「まだ出番が来ていない」列を API の契約に足すことになる（SDK / CLI / MCP も見る）。
//    🚨 **ゴミ箱の画面を作る人へ**: そこで初めて要るので、**そのときに足して、
//    画面で出ることを実測してください**。
export type PublicFileRow = Omit<FileRow, "compressed_key" | "deleted_at"> & {
  readonly [publicFileBrand]: true;
};

/**
 * 🚨 **API に返さない列を落とす唯一の場所。ここが守り手そのもの。**
 * この関数の中の `as` は**意図した1箇所**で、外に増やさないこと。
 */
function toPublicFile(
  row: FileRow,
  allowedFields: PermissionResolution["allowedFields"] = "*",
): PublicFileRow {
  // 内部列と、呼び出し元の列権限で許可されていない列を落とす。
  const publicFields: Omit<FileRow, "compressed_key" | "deleted_at"> & { compressed_key?: string | null; deleted_at?: string | null } = {
    ...row,
  };
  delete publicFields.compressed_key;
  // 🚨 **型で外しただけでは消えない**（このファイルの上に「型は守り手ではない」と書いてある）。
  //    実行時にも落とす。落とさないと `{ ...row }` でそのまま外へ出る。
  delete publicFields.deleted_at;
  if (allowedFields !== "*") {
    const allowed = new Set(allowedFields);
    for (const field of Object.keys(publicFields)) {
      if (!allowed.has(field)) delete publicFields[field as keyof typeof publicFields];
    }
  }
  return publicFields as PublicFileRow;
}

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
  /**
   * 見分けるための色。**Tailwind のトークン名**（`amber` など）を入れる。
   * 🚨 生の色コードを持たない。持つと**テーマを変えたときにフォルダだけ取り残される**。
   */
  color: string | null;
  /** ゴミ箱に入れた時刻。**null なら生きている**。読むときは `liveFolders()` を通す。 */
  deleted_at: string | null;
};

type PublicFolderRow = Omit<FolderRow, "deleted_at">;

function toPublicFolder(
  row: FolderRow,
  allowedFields: PermissionResolution["allowedFields"] = "*",
): PublicFolderRow {
  const publicFields: Omit<FolderRow, "deleted_at"> & { deleted_at?: string | null } = { ...row };
  delete publicFields.deleted_at;
  if (allowedFields !== "*") {
    const allowed = new Set(allowedFields);
    for (const field of Object.keys(publicFields)) {
      if (!allowed.has(field)) delete publicFields[field as keyof typeof publicFields];
    }
  }
  return publicFields as PublicFolderRow;
}

type SystemCollection = "directus_files" | "directus_folders";

export type UploadFileInput = {
  filename: string;
  contentType?: string;
  body: Buffer;
  title?: string | null;
  description?: string | null;
  tags?: string | null;
  folder?: string | null;
  /**
   * 配信用の圧縮版を作るか。**既定は作る**（省略時 true）。
   * 🚨 false にしても元は変わらない（元はどちらでもそのまま保存される）。
   *    切ると配信が重くなるだけで、失うものは無い。
   */
  compress?: boolean;
  /**
   * 取り込み元などの付帯情報。そのまま `directus_files.metadata`（json）へ入る。
   * 🚨 **利用者に見せてよいものだけ入れること。** この列は API のレスポンスに載る。
   *    アクセストークンや内部のキーを入れない。
   */
  metadata?: unknown;
};

export type ListInput = {
  limit?: string | null;
  offset?: string | null;
  folder?: string | null;
  q?: string | null;
  /**
   * このラベルが付いているものだけに絞る。
   * 🚨 **フォルダの絞り込みと同時に効く**（「このフォルダの中で、このラベルが付いたもの」）。
   *    どちらかを無視すると、利用者は**絞ったつもりで絞れていない**一覧を見る。
   */
  label?: string | null;
};

export type AssetResult = {
  body: Buffer;
  contentType: string;
  contentLength: number;
  contentDisposition?: string;
  /**
   * 🚨 必須にしている。省略可にすると経路が増えたとき付け忘れる。
   * 常に "nosniff"（AGENTS.md §3.4 / 受入基準 #9）。
   */
  contentTypeOptions: string;
};

export type FileVisibility = "public" | "link" | "private";

export type TransformInput = {
  width?: string | null;
  height?: string | null;
  fit?: string | null;
  format?: string | null;
  quality?: string | null;
  withoutEnlargement?: string | null;
};

function actorUserId(actor: Actor | null): string | null {
  if (!actor) return null;
  return actor.type === "human" ? actor.userId : actor.onBehalfOf;
}

export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, "_");
  const sanitized = base.replace(/^\.+$/, "");
  return sanitized || "file";
}

function inferContentType(filename: string, uploadedType?: string): string {
  const extType = MIME_BY_EXT[path.extname(filename).toLowerCase()];
  if (!extType) return "application/octet-stream";
  if (!uploadedType) return extType;
  return uploadedType.toLowerCase() === extType ? extType : "application/octet-stream";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_FIELD", `${field}は文字列またはnullで指定してください`);
  }
  return value;
}

function parseList(input: ListInput): { limit: number; offset: number } {
  const limit = input.limit === undefined || input.limit === null || input.limit === ""
    ? DEFAULT_LIMIT
    : Number(input.limit);
  const offset = input.offset === undefined || input.offset === null || input.offset === ""
    ? 0
    : Number(input.offset);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ApiError(400, "INVALID_LIMIT", `limitは1〜${MAX_LIMIT}の整数で指定してください`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ApiError(400, "INVALID_OFFSET", "offsetは0以上の整数で指定してください");
  }
  return { limit, offset };
}

async function imageMetadata(buffer: Buffer): Promise<{
  width: number | null;
  height: number | null;
  type: string | null;
  /** sharp が読み取った実際の形式（jpeg / png / gif / webp …）。圧縮の可否判定に使う。 */
  format: string | null;
}> {
  try {
    const metadata = await sharp(buffer).metadata();
    const format = metadata.format;
    const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
    // 🚨 EXIF の向きが 5〜8 のとき、metadata() が返す寸法は**回す前**のもの。
    // 配信側は必ず .rotate() を通す（＝画素が起きる）ので、そのまま保存すると
    // **DB の寸法と実際に表示される画素が縦横逆**になる。
    // <Image width height> に渡す値なので、ずれると読み込み時に画面が飛び跳ねる。
    // 実測: orientation=6 の 200x100 → metadata() は 200x100、配信される画素は 100x200。
    // （sharp 0.35.3 の autoOrient 指定では metadata() の寸法は変わらなかった）
    const orientation = metadata.orientation ?? 1;
    const swapped = orientation >= 5 && orientation <= 8;
    const width = swapped ? metadata.height : metadata.width;
    const height = swapped ? metadata.width : metadata.height;
    return {
      width: width ?? null,
      height: height ?? null,
      type: SUPPORTED_TRANSFORM_MIME.has(mime) ? mime : null,
      format: format ?? null,
    };
  } catch {
    return { width: null, height: null, type: null, format: null };
  }
}

function assertImagePixelLimit(metadata: {
  width: number | null;
  height: number | null;
  format: string | null;
}): void {
  if (
    metadata.format &&
    metadata.width !== null &&
    metadata.height !== null &&
    metadata.width * metadata.height > MAX_IMAGE_PIXELS
  ) {
    throw new ApiError(
      413,
      "IMAGE_TOO_MANY_PIXELS",
      "画像の画素数が上限を超えています",
    );
  }
}

async function relationRows(): Promise<RelationMeta[]> {
  return db<RelationMeta>("directus_relations").select("*");
}

function assertPermission(permission: PermissionResolution): void {
  if (!permission.allowed) {
    throw new ApiError(403, "PERMISSION_DENIED", "権限がありません");
  }
}

async function permissionForAction(
  actor: Actor,
  collection: SystemCollection,
  action: PermissionAction,
): Promise<PermissionResolution> {
  const permission = await resolvePermission(actor, collection, action);
  assertPermission(permission);
  return permission;
}

function applyRowFilter(
  query: Knex.QueryBuilder,
  rowFilter: FilterObject | null,
  collection: SystemCollection,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
): void {
  if (!rowFilter) return;
  applyFilter(
    query as Knex.QueryBuilder<Record<string, unknown>, unknown[]>,
    rowFilter,
    { collection, schemaOverview, relations },
  );
}

function assertFieldsAllowed(
  body: Record<string, unknown>,
  allowedFields: PermissionResolution["allowedFields"],
  writableFields: ReadonlySet<string>,
): void {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(body)) {
    if (!writableFields.has(key)) {
      throw new ApiError(400, "INVALID_FIELD", `更新できないフィールドです: ${key}`);
    }
    if (allowedFields !== "*" && !allowed.has(key)) {
      throw new ApiError(403, "FIELD_FORBIDDEN", `更新できないフィールドです: ${key}`);
    }
  }
}

async function assertFileVisibleAfterWrite(
  trx: Knex.Transaction,
  id: string,
  permission: PermissionResolution,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
): Promise<void> {
  if (!permission.rowFilter) return;
  const check = trx<FileRow>("directus_files").whereNull("deleted_at").where({ id });
  applyRowFilter(check, permission.rowFilter, "directus_files", schemaOverview, relations);
  if (!(await check.first("id"))) {
    throw new ApiError(403, "PERMISSION_DENIED", "書き込んだ内容が権限の範囲外です");
  }
}

async function assertFolderVisibleAfterWrite(
  trx: Knex.Transaction,
  id: string,
  permission: PermissionResolution,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
): Promise<void> {
  if (!permission.rowFilter) return;
  const check = trx<FolderRow>("directus_folders").whereNull("deleted_at").where({ id });
  applyRowFilter(check, permission.rowFilter, "directus_folders", schemaOverview, relations);
  if (!(await check.first("id"))) {
    throw new ApiError(403, "PERMISSION_DENIED", "書き込んだ内容が権限の範囲外です");
  }
}

async function findFile(
  id: string,
  rowFilter: FilterObject | null,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
  publicOnly = false,
): Promise<FileRow> {
  const query = liveFiles().where({ id });
  if (publicOnly) query.whereIn("visibility", ["public", "link"]);
  applyRowFilter(query, rowFilter, "directus_files", schemaOverview, relations);
  // 🚨 **id の形が uuid でないと、DB が 22P02 を投げて 500 になる**（実測 2026-08-17:
  //    /api/files/zz-not-an-id が 500 INTERNAL_ERROR。
  //    🟢 対照 形の正しい無い id は 404 FILE_NOT_FOUND）。
  //    利用者から見れば、どちらも「そんなファイルは無い」なので **404 に寄せる**
  //    （schema が collections で同じ判断をしている: 壊れた id を 500 でなく 404 に）。
  //    500 のままだと「アプリが壊れた」に見え、画面側も notFound() へ落とせず
  //    **HTTP 200 のまま右パネルが「編集できます」と約束してしまう**（auth の実測）。
  let row: FileRow | undefined;
  try {
    row = await query.first();
  } catch (error) {
    // 22P02 invalid_text_representation … uuid の列に uuid でない値
    if ((error as { code?: unknown } | null)?.code === "22P02") {
      throw new ApiError(404, "FILE_NOT_FOUND", "ファイルが見つかりません");
    }
    throw error;
  }
  if (!row) {
    throw new ApiError(404, "FILE_NOT_FOUND", "ファイルが見つかりません");
  }
  return row;
}

async function findFileByPublicToken(token: string): Promise<FileRow> {
  const row = await liveFiles().where({ public_token: token }).first();
  // 🚨 「公開」と「リンクを知っている人のみ」は、いまは配信の挙動が同じ（どちらも cookie 無しで開ける）。
  //    差が出るのは「一覧や検索に出るかどうか」だが、その経路がまだ無い（2026-08-18 実測）。
  //    先に状態だけ持たせてある。一覧・検索を作るときに、ここを見て分岐すること。
  if (!row || row.visibility === "private") {
    throw new ApiError(404, "FILE_NOT_FOUND", "ファイルが見つかりません");
  }
  return row;
}

function ensureStoredFile(row: FileRow): string {
  if (!row.filename_disk) {
    throw new ApiError(404, "FILE_NOT_STORED", "ストレージ上のファイルが見つかりません");
  }
  return row.filename_disk;
}

/**
 * 🚨 その行を**保存したときの保管先**を返す。今の設定（getStorage）で読まないこと。
 *
 * directus_files.storage には保存時のドライバ名（local / s3）が入っている。
 * これを見ずに今の設定で読むと、**ローカル運用のまま後から S3 を設定した瞬間に
 * 過去のファイルが全部 404 になる**（切り替えるまで誰も気づけない壊れ方）。
 */
async function storageForRow(row: FileRow): Promise<StorageDriver> {
  const storage = await getStorageByName(row.storage);
  if (!storage) {
    // 例: S3 に置いたファイルなのに S3 の設定が外れている。
    // 今の設定で代わりに読むと「別の場所を見て 404」になり、原因が分からなくなるので、
    // 🚨 この経路を 2026-08-15 に**実際に1回通した**（共有環境は全部ローカル FS なので、
    //    それまで一度も踏まれていなかった）。検査用のファイル 1 件の `storage` を `s3` に
    //    書き換えて読むと、**503 STORAGE_UNAVAILABLE**（「このファイルの保管先が設定されていません」）。
    //    🚨 500 でも、無言の空応答でも、スタックの露出でもない。
    //    🚨 文言も経路と合っている——「見つかりません」ではなく「**保管先が設定されていません**」。
    // 保管先が無いことをそのまま失敗として返す。**設定値そのものは出さない**（AGENTS.md §3.7）。
    throw new ApiError(
      503,
      "STORAGE_UNAVAILABLE",
      "このファイルの保管先が設定されていません",
    );
  }
  return storage;
}

export async function uploadFile(actor: Actor | null, input: UploadFileInput): Promise<PublicFileRow> {
  // 初期設定の setup session は actor=null で通す。それ以外の入口は、directus_files
  // の create 権限をここで統一して確認する（files API / Drive import / onboarding）。
  if (actor) await permissionForAction(actor, "directus_files", "create");
  if (input.body.byteLength > maxUploadBytes()) {
    throw new ApiError(413, "FILE_TOO_LARGE", `ファイルサイズは${maxUploadMb()}MB以下にしてください`);
  }

  const id = randomUUID();
  const filename = sanitizeFilename(input.filename);
  const key = `${id}/${filename}`;
  // 🚨 効いている上限は「名前の長さ」ではなく **保存先の鍵の長さ**。
  //    filename_disk は varchar(255) で、そこへ `${id}/${filename}` が入る（＝ uuid 36 + "/" 1 ぶん短くなる）。
  //    【実測 2026-08-17】名前 255 文字＝鍵 292 → 500 ／ 名前 216 文字＝鍵 253 → 201
  const MAX_KEY_CHARS = 255;
  const MAX_FILENAME_CHARS = 255;
  const MAX_FILENAME_BYTES = 255;
  if (
    key.length > MAX_KEY_CHARS ||
    input.filename.length > MAX_FILENAME_CHARS ||
    Buffer.byteLength(filename, "utf8") > MAX_FILENAME_BYTES
  ) {
    throw new ApiError(400, "FILE_NAME_TOO_LONG", "ファイル名が長すぎます（218文字まで）");
  }
  const storage = await getStorage();
  const detected = await imageMetadata(input.body);
  assertImagePixelLimit(detected);
  const contentType = detected.type ?? inferContentType(filename, input.contentType);
  const userId = actorUserId(actor);
  const now = new Date().toISOString();

  try {
    await storage.put(key, input.body, contentType);
  } catch (error) {
    // 🚨 入れ物ごと片づける（ローカルは <id>/ のディレクトリが残るため）。
    //    🚨 握り潰さない。名前だけ残す（既存の巻き戻しと同じ形・同じ理由）。
    try {
      // 🚨 `deletePrefix` は driver で任意。無いドライバでも、せめて本体は消す。
      if (storage.deletePrefix) {
        await storage.deletePrefix(id);
      } else {
        await storage.delete(key);
      }
    } catch (cleanupError) {
      console.error("[files] アップロードの巻き戻しに失敗しました（実体が残っている可能性があります）", {
        key,
        name: cleanupError instanceof Error ? cleanupError.name : "UnknownError",
      });
    }
    throw error;
  }

  // 🚨 配信用の圧縮版とぼかし画像。**失敗してもアップロードは落とさない**
  //    （飾りのために本体を壊さない）。元のファイルは上で保存済みなので、ここで何が起きても元は無傷。
  let storedCompressedKey: string | null = null;
  if (input.compress !== false) {
    try {
      const compressed = await compressImage(input.body, detected.format);
      if (compressed) {
        await storage.put(compressedKey(id), compressed.buffer, compressed.contentType);
        // 🚨 置けてから記録する。先に記録すると「あるはずなのに無い」行ができる。
        storedCompressedKey = compressedKey(id);
      }
    } catch {
      // 保存にも失敗したら圧縮版なしで続ける（配信は元にフォールバックする）。
      storedCompressedKey = null;
    }
  }

  // 🚨 ぼかしは圧縮のトグルと**独立**。圧縮を切っても読み込み中の表示は要る。
  const blurDataUrl = await createBlurDataUrl(input.body, detected.format);

  try {
    const [row] = await db<FileRow>("directus_files")
      .insert({
        id,
        storage: storage.name,
        filename_disk: key,
        filename_download: input.filename,
        title: input.title ?? path.parse(filename).name,
        type: contentType,
        folder: input.folder ?? null,
        uploaded_by: userId,
        uploaded_on: now,
        modified_by: userId,
        modified_on: now,
        filesize: input.body.byteLength,
        width: detected.width,
        height: detected.height,
        description: input.description ?? null,
        tags: input.tags ?? null,
        // 🚨 undefined と null を分ける。undefined は「渡されなかった」なので触らない。
        metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
        blur_data_url: blurDataUrl,
        compressed_key: storedCompressedKey,
        is_public: true,
        visibility: "public",
        public_token: randomUUID(),
      })
      .returning("*");
    return toPublicFile(row);
  } catch (error) {
    // 🚨 **巻き戻しで元の例外を殺さない。**
    //    ここが素で `await storage.delete(key)` だったとき、**delete が投げると下の
    //    `throw error` に到達せず、本当の失敗が消えていた**（2026-08-17 実測: V1-B が
    //    502 `STORAGE_ERROR (Error)` を返し、**SDK の例外名すら分からなくなった**）。
    //    ＝ 502 の括弧に出るのは「最後に投げた人の名前」で、原因の名前ではなかった。
    try {
      // 🚨 key だけ消すと ①ディレクトリが空のまま残る ②圧縮版・ぼかしが残る。
      //    【実測 2026-08-17】500 のあと .storage に空のディレクトリが 2 つ残っていた。
      // 🚨 `deletePrefix` は driver で任意。無いドライバでも、せめて本体は消す。
      if (storage.deletePrefix) {
        await storage.deletePrefix(id);
      } else {
        await storage.delete(key);
      }
    } catch (cleanupError) {
      // 🚨 **握り潰さない。** 黙ると「**消し残しが在るのに誰も知らない**」になる
      //    （＝ 孤児が増えるのに、増えたことが分からない）。
      //    🚨 **名前だけ残す**（`toStorageError` と同じ理由——例外オブジェクトには
      //       アクセスキー等が入りうるので、そのままログへ出さない）。
      console.error(
        "[files] アップロードの巻き戻しに失敗しました（実体が残っている可能性があります）",
        {
          key,
          name: cleanupError instanceof Error ? cleanupError.name : "UnknownError",
        },
      );
    }
    throw error;
  }
}

export async function listFiles(actor: Actor, input: ListInput): Promise<PublicFileRow[]> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  const { limit, offset } = parseList(input);
  const query = liveFiles()
    .select("*")
    .orderBy("uploaded_on", "desc")
    .limit(limit)
    .offset(offset);
  if (input.folder === "root") {
    query.whereNull("folder");
  } else if (input.folder) {
    query.where("folder", input.folder);
  }
  if (input.label) {
    // 🚨 join でなく whereIn で絞る。join すると、同じファイルに複数のラベルが
    //    付いているときに**行が増える**（同じファイルが何度も出る）。
    query.whereIn(
      "id",
      db("ohmycms_label_assignments")
        .select("target_id")
        .where({ target_type: "file", label_id: input.label }),
    );
  }
  const needle = (input.q ?? "").trim();
  if (needle) {
    const pattern = `%${needle}%`;
    query.where((builder) => {
      builder.whereILike("filename_download", pattern).orWhereILike("title", pattern);
    });
  }
  applyRowFilter(query, permission.rowFilter, "directus_files", schemaOverview, relations);
  return (await query).map((row) => toPublicFile(row, permission.allowedFields));
}

export async function getFile(actor: Actor, id: string): Promise<PublicFileRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  return toPublicFile(
    await findFile(id, permission.rowFilter, schemaOverview, relations),
    permission.allowedFields,
  );
}

export async function updateFile(
  actor: Actor,
  id: string,
  body: Record<string, unknown>,
): Promise<PublicFileRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "update");
  const relations = permission.rowFilter ? await relationRows() : [];
  assertFieldsAllowed(
    body,
    permission.allowedFields,
    new Set(["title", "description", "tags", "folder", "visibility"]),
  );

  const patch: { title?: string | null; description?: string | null; tags?: string | null; folder?: string | null; visibility?: FileVisibility } = {
    title: optionalString(body.title, "title"),
    description: optionalString(body.description, "description"),
    tags: optionalString(body.tags, "tags"),
    folder: optionalString(body.folder, "folder"),
    visibility: body.visibility === undefined ? undefined : body.visibility as FileVisibility,
  };
  if (patch.visibility !== undefined && patch.visibility !== "public" && patch.visibility !== "link" && patch.visibility !== "private") {
    throw new ApiError(400, "INVALID_FIELD", "visibilityが不正です");
  }
  const update: Record<string, unknown> = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  if (patch.visibility !== undefined) update.is_public = patch.visibility !== "private";

  const row = await db.transaction(async (trx) => {
    const [updated] = await trx<FileRow>("directus_files")
      .whereNull("deleted_at")
      .where({ id })
      .modify((query) => {
        applyRowFilter(query, permission.rowFilter, "directus_files", schemaOverview, relations);
      })
      .update({
        ...update,
        modified_by: actorUserId(actor),
        modified_on: new Date().toISOString(),
      })
      .returning("*");

    if (!updated) {
      throw new ApiError(404, "FILE_NOT_FOUND", "ファイルが見つかりません");
    }
    await assertFileVisibleAfterWrite(trx, id, permission, schemaOverview, relations);
    return updated;
  });
  return toPublicFile(row, permission.allowedFields);
}

export async function rotatePublicToken(actor: Actor, id: string): Promise<PublicFileRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "update");
  const relations = permission.rowFilter ? await relationRows() : [];
  const [row] = await liveFiles().where({ id }).modify((query) => {
    applyRowFilter(query, permission.rowFilter, "directus_files", schemaOverview, relations);
  }).update({ public_token: randomUUID(), modified_by: actorUserId(actor), modified_on: new Date().toISOString() }).returning("*");
  if (!row) throw new ApiError(404, "FILE_NOT_FOUND", "ファイルが見つかりません");
  return toPublicFile(row);
}

export async function deleteFile(actor: Actor, id: string): Promise<void> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "delete");
  const relations = permission.rowFilter ? await relationRows() : [];
  const row = await findFile(id, permission.rowFilter, schemaOverview, relations);
  // 🚨 権限の確認は残す（ラベルの割り当てまで含めて消してよいか）。
  //    いまは割り当てを消さないが、**消せる権限が無い人が削除できてはいけない**。
  await authorizeTarget(actor, "file", id, "delete");
  // 🚨 **実体を消さない**（283 A・2026-08-16「ソフトデリートおよびゴミ箱を導入」）。
  //    消すと**戻せない**——ゴミ箱から戻したときに、一覧には出るが開けない状態になる。
  //    実体は 90 日後の掃除が消す。ここで `storage.deletePrefix` を呼ばないこと。
  // 🚨 **ラベルの割り当ても消さない**。外部キーが張れない（target_id が files と
  //    folders のどちらも指す）ので、以前はここで消していた。消すと**戻すときに戻らない**。
  //    画面から隠すのは、割り当て側の担当（`ohmycms_label_assignments` を見る側）。
  const softDelete = liveFiles().where({ id });
  applyRowFilter(softDelete, permission.rowFilter, "directus_files", schemaOverview, relations);
  await softDelete.update({ deleted_at: db.fn.now() });
}

export type BulkDeleteResult = {
  /** ゴミ箱へ入れられた id。 */
  deleted: string[];
  /** 入れられなかった id と、その理由（API のコード）。 */
  failed: { id: string; code: string }[];
};

/**
 * 一度に指定できる件数の上限。
 *
 * 🚨 **上限を置く理由は速さではなく「返事が返ること」**。1 件につき
 *    権限の解決・行の取得・更新で問い合わせが複数走るので、件数に比例して伸びる。
 *    前段（Traefik / Dokploy）の時間切れに当たると、**どこまで消えたか誰にも分からない**
 *    （＝ 一番困る壊れ方）。**打ち切りは呼ぶ側に見せる**（400 で断る）。
 */
export const MAX_BULK_DELETE = 100;

/**
 * まとめてゴミ箱へ入れる。
 *
 * 🚨 **1 件ずつの `deleteFile` をそのまま呼ぶ。** 速さのために権限の解決をまとめたり、
 *    `whereIn` で 1 本の UPDATE にしたりしない——**入口が 2 つになると、権限・行フィルタ・
 *    ラベルの認可の扱いが 2 箇所に割れ、片方が腐る**
 *    （`knowledge/decisions/user-tables-have-one-entrance.md` と同じ考え方）。
 *    ＝ **行ごとに権限が判定される**ことが、実装の形から保証される。
 *
 * 🚨 **部分的な失敗で全部やめない。** ゴミ箱へ入れるのは**戻せる**操作なので、
 *    27 件だけ入っても害が無く、**1 件の失敗で 29 件を巻き戻すほうが利用者を困らせる**
 *    （消えない理由が分からないまま、全部やり直しになる）。
 * 🚨 **その代わり「成功」とだけ返さない。** 呼ぶ側が
 *    「**何件入って、どれがなぜ入らなかったか**」を必ず受け取る形にする
 *    （`deleted` / `failed` を両方返す。**片方だけ見ても嘘にならない**）。
 *
 * 🚨 **活動ログは書かない。** 1 件ずつの削除も書いていない（実測 2026-08-17:
 *    `directus_activity` に `collection='directus_files'` の行は **0 件**。
 *    🟢 対照 活動ログ全体は 39 件＝ 表そのものは動いている）。
 *    ここだけ書くと **1 件ずつとまとめてで監査の粒度が変わる**ので、
 *    **ファイルの操作を記録するかどうかは、この口とは別に決める**。
 */
export async function deleteFiles(actor: Actor, ids: string[]): Promise<BulkDeleteResult> {
  if (ids.length === 0) {
    throw new ApiError(400, "IDS_REQUIRED", "idsに1件以上のidを指定してください");
  }
  if (ids.length > MAX_BULK_DELETE) {
    throw new ApiError(
      400,
      "TOO_MANY_ITEMS",
      `一度に指定できるのは${MAX_BULK_DELETE}件までです`,
    );
  }

  const deleted: string[] = [];
  const failed: { id: string; code: string }[] = [];
  // 🚨 同じ id が 2 回来ても 2 回目は 404 になる（1 回目でゴミ箱に入り、`liveFiles()` から外れる）。
  //    **重複は先に畳む**——利用者が選び直しただけで「失敗 1 件」と出るのは嘘に近い。
  for (const id of [...new Set(ids)]) {
    try {
      await deleteFile(actor, id);
      deleted.push(id);
    } catch (error) {
      // 🚨 **理由を捨てない。** ここで握り潰すと「消えなかったのに理由が無い」になる。
      //    コードだけ返す（文言は呼ぶ側が辞書から引く。`AGENTS.md` §3.8）。
      failed.push({ id, code: isApiError(error) ? error.code : "UNEXPECTED" });
    }
  }
  return { deleted, failed };
}

/**
 * その行の**実体（バイト）を消す**。**行そのものは消さない**（行を消すのは呼ぶ側）。
 *
 * 使うのは 2 か所だけ:
 *   ① ゴミ箱の「完全に削除」（`lib/trash`）
 *   ② 90 日の掃除
 * 🚨 **判定を 2 箇所に書かないこと。** どちらも**この関数を呼ぶ**（キーの組み立ては
 *    `lib/files` の中にしか無い ＝ `compressed_key` を外へ出さずに済む唯一の形）。
 *
 * 🚨 **順番は「実体 → 行」。** 逆にすると、実体の削除に失敗したときに
 *    **キーを持つ行がもう無い**ので、二度と辿り着けない孤児になる。
 *    （開発 DB に **08-13 の孤児が 25 件**残っている。物理削除の時代の残骸で、
 *      いま数えられるのは `.storage` と `directus_files` を突き合わせたときだけ。）
 *
 * 🚨 **権限は見ていない**。「消してよいか」は呼ぶ側の判断
 *    （`isLiveRow` と同じで、1 つの関数に 2 つの問いを入れない）。
 *
 * 🚨 **保管先が設定されていないときは投げる**（`storageForRow` が 503）。
 *    「消せなかったのに消したことにする」のが、いちばん危ない。
 *
 * 🚨 **「消した」と「元から無かった」を分けて返す。**
 *    どちらも例外にしない——**無いものを消せないのは失敗ではない**（目的は達成している）。
 *    ここを失敗にすると、90 日の掃除が**同じ id で永久に落ち続ける**（司令塔・2026-08-17）。
 *    ただし 🚨 **区別できる形で返す**（`missing` だけが並ぶなら、
 *    **保管先を取り違えている**か、**誰かが手で消した**のどちらかで、どちらも知りたい）。
 */
export type StoredObjectRemoval = {
  /** 実際に在って、消したキー */
  removed: string[];
  /** 行は指しているのに、**保管先に無かった**キー */
  missing: string[];
};

export async function deleteStoredObjects(fileId: string): Promise<StoredObjectRemoval> {
  // 🚨 ここは **ゴミ箱に在る行**（`deleted_at` が入っている）を消すための関数なので、
  //    `liveFiles()` を通さず素の `db(...)` を使う。**この理由をここに書いておくこと**
  //    （`lib/files/live.ts` が「素で書くな」と言っている、その例外）。
  const row = await db<FileRow>("directus_files").where({ id: fileId }).first();
  // 行が無ければ、どのキーを消せばよいか分からない（＝ 実体は孤児のまま残る）。
  // 🚨 ここで黙って戻るのは、**呼ぶ側が行を先に消してしまった**ときだけなので、
  //    上の「順番」を守る限り起きない。
  if (!row) return { removed: [], missing: [] };
  const storage = await storageForRow(row);
  const removed: string[] = [];
  const missing: string[] = [];
  // 🚨 **知っているキーは、分岐に置かず必ず消す。** **列を増やしたらここも増やすこと。**
  //    最初は「`deletePrefix` が在ればそれだけ」にしていたが、
  //    🚨 **いまの 2 ドライバ（local / s3）は両方 `deletePrefix` を持つ**ので、
  //    1 つずつ消す側が**一度も通らない**＝ **測れない分岐**が残っていた。
  //    両方を毎回通せば、**測れない分岐が無くなる**（消す回数より、測れることを採る）。
  //    どちらの `delete` も**無いキーで落ちない**（local は `force: true` / S3 は 204）。
  for (const key of [row.filename_disk, row.compressed_key]) {
    if (!key) continue;
    // 🚨 **消す前に在るかを見る**。`delete` は無いキーでも落ちないので、
    //    **消したのか、元から無かったのかを、後から言えない**（それを分けるのがここ）。
    //    🚨 順番は **head → delete**。逆にすると必ず「無かった」になる。
    const found = await storage.head(key);
    await storage.delete(key);
    (found ? removed : missing).push(key);
  }
  // 取りこぼし（`${id}/` の下に、行が知らない物が在る場合）と、local の空ディレクトリは
  // prefix ごと消せるドライバだけが拾える。🚨 `deletePrefix` は driver で**任意**（`?`）。
  // 🚨 ここで消えた物は `removed` に入らない（**行が知らないので、名前を言えない**）。
  await storage.deletePrefix?.(`${row.id}/`);
  return { removed, missing };
}

function parseDimension(value: string | null | undefined, field: string, maximum: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "INVALID_TRANSFORM", `${field}は1以上の整数で指定してください`);
  }
  return Math.min(parsed, maximum);
}

function parseQuality(value: string | null | undefined): number {
  if (value === undefined || value === null || value === "") return 80;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new ApiError(400, "INVALID_TRANSFORM", "qualityは1〜100の整数で指定してください");
  }
  return parsed;
}

function parseFit(value: string | null | undefined): ResizeFit {
  if (value === undefined || value === null || value === "") return "cover";
  if (value === "cover" || value === "contain" || value === "inside" || value === "outside") {
    return value;
  }
  throw new ApiError(400, "INVALID_TRANSFORM", "fitが不正です");
}

function parseFormat(value: string | null | undefined, currentMime: string): {
  format: "jpeg" | "png" | "webp" | "avif";
  ext: string;
  mime: string;
} {
  const current = currentMime === "image/jpeg" ? "jpeg" : currentMime.replace("image/", "");
  const format = value === undefined || value === null || value === "" ? current : value;
  if (format === "jpeg" || format === "png" || format === "webp" || format === "avif") {
    return { format, ext: format === "jpeg" ? "jpg" : format, mime: `image/${format}` };
  }
  throw new ApiError(400, "INVALID_TRANSFORM", "formatが不正です");
}

function parseWithoutEnlargement(value: string | null | undefined): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ApiError(400, "INVALID_TRANSFORM", "withoutEnlargementはtrueまたはfalseで指定してください");
}

function countTransformOperations(input: TransformInput): number {
  return [input.width, input.height, input.fit, input.format, input.quality, input.withoutEnlargement]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .length;
}

function normalizedTransformString(input: {
  width: string;
  height: string;
  fit: ResizeFit;
  format: string;
  quality: string;
  withoutEnlargement: string;
  outputMaxDimension: number;
  inputMaxDimension: number;
  timeoutMs: number;
}): string {
  return `width=${input.width}&height=${input.height}&fit=${input.fit}&format=${input.format}&quality=${input.quality}&withoutEnlargement=${input.withoutEnlargement}&outputMax=${input.outputMaxDimension}&inputMax=${input.inputMaxDimension}&timeout=${input.timeoutMs}`;
}

function safeDeliveryHeaders(type: string | null, filename: string): {
  contentType: string;
  contentDisposition?: string;
  contentTypeOptions: string;
} {
  const contentType = type && !DANGEROUS_INLINE_MIME.has(type)
    ? type
    : "application/octet-stream";
  // 🚨 MIME だけで判断しない。**拡張子でも判断する**。
  // inferContentType は「申告 MIME と拡張子が食い違う」と application/octet-stream にするため、
  // evil.html を text/plain と偽って上げると type が octet-stream になり、
  // DANGEROUS_INLINE_MIME に当たらず attachment が付かなかった（実測で確認）。
  // 中身は HTML のままなので、拡張子側からも塞ぐ。
  const ext = path.extname(filename).toLowerCase();
  const dangerous =
    (type !== null && DANGEROUS_INLINE_MIME.has(type)) ||
    DANGEROUS_INLINE_EXT.has(ext);
  const contentDisposition = dangerous
    ? `attachment; filename="${sanitizeFilename(filename)}"`
    : undefined;
  // 🚨 全レスポンスに nosniff を付ける（多層防御）。
  // Content-Disposition: attachment は「危険な MIME」に限って付けているが、
  // 保存される MIME はクライアントの申告と拡張子から決まるため、
  // SVG の中身を image/png として保存させて attachment を回避できる。
  // nosniff はブラウザの MIME 推測そのものを止めるので、その抜け道を塞ぐ。
  // 危険な MIME だけに付けると、まさにその「誤った MIME で保存された file」に付かない。
  // 🚨 **`next.config.ts` の `headers()` が全応答に付けているのに、ここでも自前で付ける理由**:
  //    既定を外した人が、この経路まで道連れにしないため（2026-08-17・toast の指摘）。
  //    ＝ **既定が消えても、ファイル配信だけは自分で守れる**。二重にはならない（応答は 1 行）。
  //    🚨 **なぜ nosniff が要るか**は AGENTS.md §3.4 が正本。**ここには書き写さない**。
  // AGENTS.md §3.4 / 受入基準 #9
  return { contentType, contentDisposition, contentTypeOptions: "nosniff" };
}

/**
 * 🚨 **「行は在るが、実体が無い」を 404 にする。**
 *
 * 直す前は、ここで投げられた `ENOENT` がそのまま外へ出て
 * **500（`[api] 未処理の例外`）**になっていた（2026-08-17 実測）。
 * 利用者には「**サーバが壊れた**」に見えるが、実際は「**そのファイルが無い**」だけ。
 *
 * 🚨 **孤児は実在する**（`.storage` と `directus_files` の突き合わせで 25 件）ので、
 *    この経路は例外ではなく、**普通に起きる**。
 *
 * 🚨 **新しい code を作らない。** 同じ意味の `FILE_NOT_STORED` が既に在る
 *    （`ensureStoredFile`。**列が空**のとき）。**「行が実体を指しているのに無い」も同じ結論**なので、
 *    同じ code に寄せる——**画面は 2 つの文言を出し分けられない**。
 *
 * 🚨 **どのドライバでも同じ結論にする**（local は `ENOENT`、S3 は `NoSuchKey` を投げる）。
 *    ここで揃えないと、**保管先を替えた日に状態コードが変わる**。
 */
function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  if (e.code === "ENOENT") return true;
  if (e.name === "NoSuchKey" || e.name === "NotFound") return true;
  // 🚨 S3 の 404 は name が実装差で揺れるので、状態コードでも見る。
  return e.$metadata?.httpStatusCode === 404;
}

async function bufferFromStorage(storage: StorageDriver, key: string): Promise<Buffer> {
  let body;
  try {
    body = await storage.get(key);
  } catch (error) {
    if (isMissingObject(error)) {
      throw new ApiError(404, "FILE_NOT_STORED", "ストレージ上のファイルが見つかりません");
    }
    // 🚨 それ以外は握り潰さない（**保管先が落ちている等は 404 ではない**）。
    throw error;
  }
  if (Buffer.isBuffer(body)) return body;
  return Buffer.from(await new Response(body).arrayBuffer());
}

export async function getAsset(actor: Actor | null, id: string, input: TransformInput): Promise<AssetResult> {
  const schemaOverview = await getSchemaOverview();
  const permission = actor ? await permissionForAction(actor, "directus_files", "read") : null;
  const relations = permission?.rowFilter ? await relationRows() : [];
  const row = await findFile(
    id,
    permission?.rowFilter ?? null,
    schemaOverview,
    relations,
    actor === null,
  );
  const originalKey = ensureStoredFile(row);
  const originalHeaders = safeDeliveryHeaders(row.type, row.filename_download);

  const limits = await imageTransformLimits();
  if (countTransformOperations(input) > limits.maxOperations) {
    throw new ApiError(400, "TRANSFORM_TOO_MANY_OPERATIONS", "画像変換の指定が多すぎます");
  }
  const width = parseDimension(input.width, "width", limits.outputMaxDimension);
  const height = parseDimension(input.height, "height", limits.outputMaxDimension);
  const hasTransformParams = Boolean(
    width ||
      height ||
      input.fit ||
      input.format ||
      input.quality ||
      input.withoutEnlargement,
  );

  // 🚨 変換キャッシュの読み書きも、元と**同じ保管先**で行う。
  //    今の設定で書くと「元は local・キャッシュは s3」というちぐはぐになり、
  //    head と get が別の場所を見る。
  const storage = await storageForRow(row);

  // 🚨 サイズの指定が無いときは、**アップロード時に作った圧縮版**を優先して返す。
  //    これが「配信を軽くする」の本体。指定があるときは元から変換する（品質を落とさないため）。
  //
  //    圧縮版が「有るか」は head で見ている。DB に列を持てば往復を1回減らせるが、
  //    **列を足さずに動く**ことを優先した（キーの有無がそのまま「圧縮したか」を表す）。
  //    🚨 SVG / HTML には圧縮版を作らないので、ここは必ず素通りして元が返る
  //       （＝ attachment の判定はそのまま効く）。
  if (!hasTransformParams && row.compressed_key) {
    try {
      const body = await bufferFromStorage(storage, row.compressed_key);
      return {
        body,
        contentType: "image/webp",
        contentLength: body.byteLength,
        // 圧縮版が作られるのは画像だけなので attachment は付かないが、nosniff は必ず付ける。
        contentTypeOptions: originalHeaders.contentTypeOptions,
      };
    } catch {
      // 🚨 圧縮版が消えていても（手で消した・移行の取りこぼし）**元から配信を続ける**。
      //    ここで落とすと、飾りが無いだけでファイルが見えなくなる。
    }
  }

  if (!hasTransformParams || !row.type || !SUPPORTED_TRANSFORM_MIME.has(row.type)) {
    const body = await bufferFromStorage(storage, originalKey);
    return {
      body,
      contentType: originalHeaders.contentType,
      contentLength: body.byteLength,
      contentDisposition: originalHeaders.contentDisposition,
      contentTypeOptions: originalHeaders.contentTypeOptions,
    };
  }

  const fit = parseFit(input.fit);
  const quality = parseQuality(input.quality);
  const withoutEnlargement = parseWithoutEnlargement(input.withoutEnlargement);
  const output = parseFormat(input.format, row.type);
  const normalized = normalizedTransformString({
    width: String(width ?? ""),
    height: String(height ?? ""),
    fit,
    format: output.format,
    quality: String(quality),
    withoutEnlargement: String(withoutEnlargement),
    outputMaxDimension: limits.outputMaxDimension,
    inputMaxDimension: limits.inputMaxDimension,
    timeoutMs: limits.timeoutMs,
  });
  const hash = createHash("sha256").update(normalized).digest("hex");
  const transformedKey = `${id}/transformed/${hash}.${output.ext}`;
  const cached = await storage.head(transformedKey);

  if (cached) {
    const body = await bufferFromStorage(storage, transformedKey);
    return {
      body,
      contentType: output.mime,
      contentLength: cached.size || body.byteLength,
      contentTypeOptions: originalHeaders.contentTypeOptions,
    };
  }

  const original = await bufferFromStorage(storage, originalKey);
  const originalMetadata = await imageMetadata(original);
  assertImagePixelLimit(originalMetadata);
  // Directus と同じく、入力画像の最大辺を超えるものは変換しない。
  // 画素数上限（40MP）はデコードを拒否する別の守りであり、この判定とは役割が異なる。
  if (
    (originalMetadata.width !== null && originalMetadata.width > limits.inputMaxDimension) ||
    (originalMetadata.height !== null && originalMetadata.height > limits.inputMaxDimension)
  ) {
    return {
      body: original,
      contentType: originalHeaders.contentType,
      contentLength: original.byteLength,
      contentDisposition: originalHeaders.contentDisposition,
      contentTypeOptions: originalHeaders.contentTypeOptions,
    };
  }
  let pipeline = sharp(original).rotate();
  if (width || height) {
    pipeline = pipeline.resize({ width, height, fit, withoutEnlargement });
  }
  const transformed = await withTransformSlot(limits.maxConcurrency, () =>
    pipeline
      // 設定は Directus 互換のミリ秒で保持し、sharp には早く切る整数秒で渡す。
      .timeout({ seconds: Math.floor(limits.timeoutMs / 1000) })
      .toFormat(output.format, { quality })
      .toBuffer(),
  );
  await storage.put(transformedKey, transformed, output.mime);
  return {
    body: transformed,
    contentType: output.mime,
    contentLength: transformed.byteLength,
    contentTypeOptions: originalHeaders.contentTypeOptions,
  };
}

export async function getPublicAsset(token: string, input: TransformInput): Promise<AssetResult> {
  const row = await findFileByPublicToken(token);
  return getAsset(null, row.id, input);
}

export async function listFolders(actor: Actor, input: ListInput): Promise<PublicFolderRow[]> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_folders", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  const { limit, offset } = parseList(input);
  const query = liveFolders()
    .select("*")
    .orderBy("name")
    .limit(limit)
    .offset(offset);
  applyRowFilter(query, permission.rowFilter, "directus_folders", schemaOverview, relations);
  return (await query).map((row) => toPublicFolder(row, permission.allowedFields));
}

export async function createFolder(actor: Actor, body: Record<string, unknown>): Promise<FolderRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_folders", "create");
  const relations = permission.rowFilter ? await relationRows() : [];
  const name = body.name;
  if (typeof name !== "string" || name.trim() === "") {
    throw new ApiError(400, "INVALID_FIELD", "nameは必須です");
  }
  const parent = optionalString(body.parent, "parent") ?? null;
  return db.transaction(async (trx) => {
    const [row] = await trx<FolderRow>("directus_folders")
      .insert({ id: randomUUID(), name: name.trim(), parent })
      .returning("*");

    if (permission.rowFilter) {
      const visibleQuery = trx<FolderRow>("directus_folders").where({ id: row.id });
      applyRowFilter(visibleQuery, permission.rowFilter, "directus_folders", schemaOverview, relations);
      const visible = await visibleQuery.first();
      if (!visible) {
        throw new ApiError(403, "PERMISSION_DENIED", "作成した行が権限範囲外です");
      }
    }

    return row;
  });
}

export async function getFolder(actor: Actor, id: string): Promise<PublicFolderRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_folders", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  const query = liveFolders().where({ id });
  applyRowFilter(query, permission.rowFilter, "directus_folders", schemaOverview, relations);
  const row = await query.first();
  if (!row) {
    throw new ApiError(404, "FOLDER_NOT_FOUND", "フォルダが見つかりません");
  }
  return toPublicFolder(row, permission.allowedFields);
}

export async function updateFolder(
  actor: Actor,
  id: string,
  body: Record<string, unknown>,
): Promise<PublicFolderRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_folders", "update");
  const relations = permission.rowFilter ? await relationRows() : [];
  assertFieldsAllowed(body, permission.allowedFields, new Set(["name", "parent", "color"]));

  const update: Record<string, unknown> = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || body.name.trim() === "") {
      throw new ApiError(400, "INVALID_FIELD", "nameは空にできません");
    }
    update.name = body.name.trim();
  }
  if ("parent" in body) {
    const parent = optionalString(body.parent, "parent") ?? null;
    if (parent === id) {
      throw new ApiError(400, "INVALID_FIELD", "自分自身を親フォルダにできません");
    }
    // 🚨 **自分の子孫の中へは入れられない。** 入れると輪ができて、
    //    **その枝ごと一覧から消えます**（互いの親が相手を指すので、ルートに出ない）。
    //    2026-08-16 実測: A の子 B に対して A の parent を B にすると **200 で通り**、
    //    A も B も一覧から消えた
    //    （🟢 対照: 自分自身を親にする方は INVALID_FIELD で弾けていた）。
    //    🚨 深さを決め打ちにしない。**辿れなくなるまで登る**。
    if (parent !== null) {
      let cursor: string | null = parent;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === id) {
          throw new ApiError(400, "INVALID_FIELD", "自分の中のフォルダへは移動できません");
        }
        // 🚨 既に輪が在るデータでも止まる（無限に登らない）
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const up: Pick<FolderRow, "parent"> | undefined = await liveFolders()
          .where({ id: cursor })
          .first("parent");
        cursor = up?.parent ?? null;
      }
    }
    update.parent = parent;
  }
  if ("color" in body) {
    // 🚨 名前だけ受ける（`#rrggbb` を弾く）。入口を緩めると、後から
    //    「生の色コードが混ざった行」を探して直す作業が発生する。
    const color = optionalString(body.color, "color") ?? null;
    if (color !== null && !FOLDER_COLORS.has(color)) {
      throw new ApiError(400, "INVALID_FIELD", "使えない色です");
    }
    update.color = color;
  }

  return db.transaction(async (trx) => {
    const [row] = await trx<FolderRow>("directus_folders")
      .whereNull("deleted_at")
      .where({ id })
      .modify((query) => {
        applyRowFilter(query, permission.rowFilter, "directus_folders", schemaOverview, relations);
      })
      .update(update)
      .returning("*");
    if (!row) {
      throw new ApiError(404, "FOLDER_NOT_FOUND", "フォルダが見つかりません");
    }
    await assertFolderVisibleAfterWrite(trx, id, permission, schemaOverview, relations);
    return toPublicFolder(row, permission.allowedFields);
  });
}

export async function deleteFolder(actor: Actor, id: string): Promise<void> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_folders", "delete");
  const relations = permission.rowFilter ? await relationRows() : [];
  const visibleQuery = liveFolders().where({ id });
  applyRowFilter(visibleQuery, permission.rowFilter, "directus_folders", schemaOverview, relations);
  const visible = await visibleQuery.first();
  if (!visible) {
    throw new ApiError(404, "FOLDER_NOT_FOUND", "フォルダが見つかりません");
  }
  // 🚨 ファイルと同じく、権限の確認だけ残す（割り当ては消さない）。
  await authorizeTarget(actor, "folder", id, "delete");

  // 🚨 **中身の判定は「生きているもの」だけを数える**（入口 `liveFiles` / `liveFolders`）。
  //    ゴミ箱に入っているファイルが中に在っても、それは「空でない」ではない。
  const file = await liveFiles().where({ folder: id }).first();
  if (file) {
    throw new ApiError(409, "FOLDER_NOT_EMPTY", "フォルダ配下にファイルがあります");
  }
  const child = await liveFolders().where({ parent: id }).first();
  if (child) {
    throw new ApiError(409, "FOLDER_NOT_EMPTY", "フォルダ配下にフォルダがあります");
  }
  // 🚨 **消さずに印を立てる**（283 A）。割り当ても消さない（戻すときに要る）。
  const softDelete = liveFolders().where({ id });
  applyRowFilter(softDelete, permission.rowFilter, "directus_folders", schemaOverview, relations);
  const marked = await softDelete.update({ deleted_at: db.fn.now() });
  if (!marked) {
    throw new ApiError(404, "FOLDER_NOT_FOUND", "フォルダが見つかりません");
  }
}

export function recordBody(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new ApiError(400, "INVALID_BODY", "JSONオブジェクトを指定してください");
  }
  return body;
}
