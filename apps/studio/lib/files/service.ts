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
import { ApiError } from "@/lib/schema/errors";
import { getSchemaOverview } from "@/lib/schema/introspect";
import type { RelationMeta } from "@/lib/schema/models";
import { authorizeTarget, removeLabelsForTarget } from "@/lib/labels/service";
import { getStorage, getStorageByName } from "@/lib/storage";
import type { StorageDriver } from "@/lib/storage/driver";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const MAX_TRANSFORM_DIMENSION = 4000;
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
export const FOLDER_COLORS = new Set(["slate", "red", "amber", "emerald", "sky", "violet"]);

type ResizeFit = "cover" | "contain" | "inside" | "outside";

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

export type PublicFileRow = Omit<FileRow, "compressed_key"> & {
  readonly [publicFileBrand]: true;
};

/**
 * 🚨 **`compressed_key` を落とす唯一の場所。ここが守り手そのもの。**
 * この関数の中の `as` は**意図した1箇所**で、外に増やさないこと。
 */
function toPublicFile(row: FileRow): PublicFileRow {
  // compressed_key だけを落とす（他の列は今までどおり返す）。
  const publicFields: Omit<FileRow, "compressed_key"> & { compressed_key?: string | null } = {
    ...row,
  };
  delete publicFields.compressed_key;
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
};

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

export type TransformInput = {
  width?: string | null;
  height?: string | null;
  fit?: string | null;
  format?: string | null;
  quality?: string | null;
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

async function findFile(
  id: string,
  rowFilter: FilterObject | null,
  schemaOverview: SchemaOverview,
  relations: RelationMeta[],
): Promise<FileRow> {
  const query = db<FileRow>("directus_files").where({ id });
  applyRowFilter(query, rowFilter, "directus_files", schemaOverview, relations);
  const row = await query.first();
  if (!row) {
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
  if (input.body.byteLength > MAX_UPLOAD_SIZE) {
    throw new ApiError(413, "FILE_TOO_LARGE", "ファイルサイズは50MB以下にしてください");
  }

  const id = randomUUID();
  const filename = sanitizeFilename(input.filename);
  const key = `${id}/${filename}`;
  const storage = await getStorage();
  const detected = await imageMetadata(input.body);
  const contentType = detected.type ?? inferContentType(filename, input.contentType);
  const userId = actorUserId(actor);
  const now = new Date().toISOString();

  await storage.put(key, input.body, contentType);

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
      })
      .returning("*");
    return toPublicFile(row);
  } catch (error) {
    await storage.delete(key);
    throw error;
  }
}

export async function listFiles(actor: Actor, input: ListInput): Promise<PublicFileRow[]> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  const { limit, offset } = parseList(input);
  const query = db<FileRow>("directus_files")
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
  applyRowFilter(query, permission.rowFilter, "directus_files", schemaOverview, relations);
  return (await query).map(toPublicFile);
}

export async function getFile(actor: Actor, id: string): Promise<PublicFileRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  return toPublicFile(await findFile(id, permission.rowFilter, schemaOverview, relations));
}

export async function updateFile(
  actor: Actor,
  id: string,
  body: Record<string, unknown>,
): Promise<PublicFileRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "update");
  const relations = permission.rowFilter ? await relationRows() : [];
  const allowed = new Set(["title", "description", "tags", "folder"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      throw new ApiError(400, "INVALID_FIELD", `更新できないフィールドです: ${key}`);
    }
  }

  const patch = {
    title: optionalString(body.title, "title"),
    description: optionalString(body.description, "description"),
    tags: optionalString(body.tags, "tags"),
    folder: optionalString(body.folder, "folder"),
  };
  const update = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );

  const [row] = await db<FileRow>("directus_files")
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

  if (!row) {
    throw new ApiError(404, "FILE_NOT_FOUND", "ファイルが見つかりません");
  }
  return toPublicFile(row);
}

export async function deleteFile(actor: Actor, id: string): Promise<void> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "delete");
  const relations = permission.rowFilter ? await relationRows() : [];
  const row = await findFile(id, permission.rowFilter, schemaOverview, relations);
  const auth = await authorizeTarget(actor, "file", id, "delete");
  const key = ensureStoredFile(row);
  // 🚨 削除も**保存したときの保管先**へ。今の設定で消すと、切り替え前のファイルが
  //    消えずに残る（利用者は消したつもりでいる）。
  const storage = await storageForRow(row);
  if (storage.deletePrefix) {
    await storage.deletePrefix(`${id}/`);
  } else {
    await storage.delete(key);
  }
  const deleteQuery = db<FileRow>("directus_files").where({ id });
  applyRowFilter(deleteQuery, permission.rowFilter, "directus_files", schemaOverview, relations);
  await deleteQuery.delete();
  // 🚨 ラベルの割り当ては外部キーで消えない（target_id が files と folders の
  //    どちらも指すため、外部キーを張れない）。**ここで消さないと残り続ける。**
  await removeLabelsForTarget("file", id, auth);
}

function parseDimension(value: string | null | undefined, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TRANSFORM_DIMENSION) {
    throw new ApiError(400, "INVALID_TRANSFORM", `${field}は1〜4000の整数で指定してください`);
  }
  return parsed;
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

function normalizedTransformString(input: {
  width: string;
  height: string;
  fit: ResizeFit;
  format: string;
  quality: string;
}): string {
  return `width=${input.width}&height=${input.height}&fit=${input.fit}&format=${input.format}&quality=${input.quality}`;
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
  // AGENTS.md §3.4 / 受入基準 #9
  return { contentType, contentDisposition, contentTypeOptions: "nosniff" };
}

async function bufferFromStorage(storage: StorageDriver, key: string): Promise<Buffer> {
  const body = await storage.get(key);
  if (Buffer.isBuffer(body)) return body;
  return Buffer.from(await new Response(body).arrayBuffer());
}

export async function getAsset(actor: Actor, id: string, input: TransformInput): Promise<AssetResult> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  const row = await findFile(id, permission.rowFilter, schemaOverview, relations);
  const originalKey = ensureStoredFile(row);
  const originalHeaders = safeDeliveryHeaders(row.type, row.filename_download);

  const width = parseDimension(input.width, "width");
  const height = parseDimension(input.height, "height");
  const hasTransformParams = Boolean(
    width ||
      height ||
      input.fit ||
      input.format ||
      input.quality,
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
  const output = parseFormat(input.format, row.type);
  const normalized = normalizedTransformString({
    width: String(width ?? ""),
    height: String(height ?? ""),
    fit,
    format: output.format,
    quality: String(quality),
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
  let pipeline = sharp(original).rotate();
  if (width || height) {
    pipeline = pipeline.resize({ width, height, fit, withoutEnlargement: false });
  }
  const transformed = await pipeline.toFormat(output.format, { quality }).toBuffer();
  await storage.put(transformedKey, transformed, output.mime);
  return {
    body: transformed,
    contentType: output.mime,
    contentLength: transformed.byteLength,
    contentTypeOptions: originalHeaders.contentTypeOptions,
  };
}

export async function listFolders(actor: Actor, input: ListInput): Promise<FolderRow[]> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_folders", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  const { limit, offset } = parseList(input);
  const query = db<FolderRow>("directus_folders")
    .select("*")
    .orderBy("name")
    .limit(limit)
    .offset(offset);
  applyRowFilter(query, permission.rowFilter, "directus_folders", schemaOverview, relations);
  return query;
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

export async function getFolder(actor: Actor, id: string): Promise<FolderRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_folders", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  const query = db<FolderRow>("directus_folders").where({ id });
  applyRowFilter(query, permission.rowFilter, "directus_folders", schemaOverview, relations);
  const row = await query.first();
  if (!row) {
    throw new ApiError(404, "FOLDER_NOT_FOUND", "フォルダが見つかりません");
  }
  return row;
}

export async function updateFolder(
  actor: Actor,
  id: string,
  body: Record<string, unknown>,
): Promise<FolderRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_folders", "update");
  const relations = permission.rowFilter ? await relationRows() : [];
  const allowed = new Set(["name", "parent", "color"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      throw new ApiError(400, "INVALID_FIELD", `更新できないフィールドです: ${key}`);
    }
  }

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

  const [row] = await db<FolderRow>("directus_folders")
    .where({ id })
    .modify((query) => {
      applyRowFilter(query, permission.rowFilter, "directus_folders", schemaOverview, relations);
    })
    .update(update)
    .returning("*");
  if (!row) {
    throw new ApiError(404, "FOLDER_NOT_FOUND", "フォルダが見つかりません");
  }
  return row;
}

export async function deleteFolder(actor: Actor, id: string): Promise<void> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_folders", "delete");
  const relations = permission.rowFilter ? await relationRows() : [];
  const visibleQuery = db<FolderRow>("directus_folders").where({ id });
  applyRowFilter(visibleQuery, permission.rowFilter, "directus_folders", schemaOverview, relations);
  const visible = await visibleQuery.first();
  if (!visible) {
    throw new ApiError(404, "FOLDER_NOT_FOUND", "フォルダが見つかりません");
  }
  const auth = await authorizeTarget(actor, "folder", id, "delete");

  const file = await db<FileRow>("directus_files").where({ folder: id }).first();
  if (file) {
    throw new ApiError(409, "FOLDER_NOT_EMPTY", "フォルダ配下にファイルがあります");
  }
  const child = await db<FolderRow>("directus_folders").where({ parent: id }).first();
  if (child) {
    throw new ApiError(409, "FOLDER_NOT_EMPTY", "フォルダ配下にフォルダがあります");
  }
  const deleteQuery = db<FolderRow>("directus_folders").where({ id });
  applyRowFilter(deleteQuery, permission.rowFilter, "directus_folders", schemaOverview, relations);
  const deleted = await deleteQuery.delete();
  if (!deleted) {
    throw new ApiError(404, "FOLDER_NOT_FOUND", "フォルダが見つかりません");
  }
  // 🚨 ファイルと同じ理由で、ここで割り当てを消す。
  await removeLabelsForTarget("folder", id, auth);
}

export function recordBody(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new ApiError(400, "INVALID_BODY", "JSONオブジェクトを指定してください");
  }
  return body;
}
