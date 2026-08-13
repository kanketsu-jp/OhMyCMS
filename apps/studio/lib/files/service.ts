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
import { getStorage } from "@/lib/storage";

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

const DANGEROUS_INLINE_MIME = new Set(["text/html", "image/svg+xml"]);

/**
 * 🚨 拡張子でも危険判定する。
 * 申告 MIME と拡張子が食い違うと inferContentType が application/octet-stream にするため、
 * MIME だけ見ていると「evil.html を text/plain と偽る」で attachment を回避できてしまう。
 */
const DANGEROUS_INLINE_EXT = new Set([
  ".html", ".htm", ".xhtml", ".svg", ".xml", ".mhtml",
]);

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
};

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
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
};

export type ListInput = {
  limit?: string | null;
  offset?: string | null;
  folder?: string | null;
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

function actorUserId(actor: Actor): string {
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
}> {
  try {
    const metadata = await sharp(buffer).metadata();
    const format = metadata.format;
    const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      type: SUPPORTED_TRANSFORM_MIME.has(mime) ? mime : null,
    };
  } catch {
    return { width: null, height: null, type: null };
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

export async function uploadFile(actor: Actor, input: UploadFileInput): Promise<FileRow> {
  if (input.body.byteLength > MAX_UPLOAD_SIZE) {
    throw new ApiError(413, "FILE_TOO_LARGE", "ファイルサイズは50MB以下にしてください");
  }

  const id = randomUUID();
  const filename = sanitizeFilename(input.filename);
  const key = `${id}/${filename}`;
  const storage = getStorage();
  const detected = await imageMetadata(input.body);
  const contentType = detected.type ?? inferContentType(filename, input.contentType);
  const userId = actorUserId(actor);
  const now = new Date().toISOString();

  await storage.put(key, input.body, contentType);
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
      })
      .returning("*");
    return row;
  } catch (error) {
    await storage.delete(key);
    throw error;
  }
}

export async function listFiles(actor: Actor, input: ListInput): Promise<FileRow[]> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  const { limit, offset } = parseList(input);
  const query = db<FileRow>("directus_files")
    .select("*")
    .orderBy("uploaded_on", "desc")
    .limit(limit)
    .offset(offset);
  if (input.folder) {
    query.where("folder", input.folder);
  }
  applyRowFilter(query, permission.rowFilter, "directus_files", schemaOverview, relations);
  return query;
}

export async function getFile(actor: Actor, id: string): Promise<FileRow> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "read");
  const relations = permission.rowFilter ? await relationRows() : [];
  return findFile(id, permission.rowFilter, schemaOverview, relations);
}

export async function updateFile(
  actor: Actor,
  id: string,
  body: Record<string, unknown>,
): Promise<FileRow> {
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
  return row;
}

export async function deleteFile(actor: Actor, id: string): Promise<void> {
  const schemaOverview = await getSchemaOverview();
  const permission = await permissionForAction(actor, "directus_files", "delete");
  const relations = permission.rowFilter ? await relationRows() : [];
  const row = await findFile(id, permission.rowFilter, schemaOverview, relations);
  const key = ensureStoredFile(row);
  const storage = getStorage();
  if (storage.deletePrefix) {
    await storage.deletePrefix(`${id}/`);
  } else {
    await storage.delete(key);
  }
  const deleteQuery = db<FileRow>("directus_files").where({ id });
  applyRowFilter(deleteQuery, permission.rowFilter, "directus_files", schemaOverview, relations);
  await deleteQuery.delete();
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

async function bufferFromStorage(key: string): Promise<Buffer> {
  const body = await getStorage().get(key);
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

  if (!hasTransformParams || !row.type || !SUPPORTED_TRANSFORM_MIME.has(row.type)) {
    const body = await bufferFromStorage(originalKey);
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
  const storage = getStorage();
  const cached = await storage.head(transformedKey);

  if (cached) {
    const body = await bufferFromStorage(transformedKey);
    return {
      body,
      contentType: output.mime,
      contentLength: cached.size || body.byteLength,
      contentTypeOptions: originalHeaders.contentTypeOptions,
    };
  }

  const original = await bufferFromStorage(originalKey);
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
  const allowed = new Set(["name", "parent"]);
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
}

export function recordBody(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new ApiError(400, "INVALID_BODY", "JSONオブジェクトを指定してください");
  }
  return body;
}
