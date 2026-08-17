import path from "node:path";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/knex";
import { maxUploadBytes, maxUploadMb } from "@/lib/files/upload-limit";
import { ApiError } from "@/lib/schema/errors";
import { getStorage } from "@/lib/storage";
import type { StorageDriver } from "@/lib/storage/driver";

export const ATTACHMENT_MAX_COUNT = 5;
/** 受け入れる MIME。🚨 ラスタ画像だけ。SVG を受けない（XML にスクリプトを埋められるため） */
export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export type BugReportAttachment = {
  id: string;
  report_id: string;
  filename: string;
  content_type: AttachmentType;
  size: number;
  uploaded_by: string | null;
  created_at: string;
};

type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export type BugReportAttachmentBody = BugReportAttachment & {
  body: Buffer;
};

const EXTENSION_TYPES: Record<string, AttachmentType> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const FALLBACK_FILENAME = "attachment";

function isAttachmentType(value: string): value is AttachmentType {
  return (ATTACHMENT_TYPES as readonly string[]).includes(value);
}

function typeFromFilename(filename: string): AttachmentType | null {
  return EXTENSION_TYPES[path.extname(filename).toLowerCase()] ?? null;
}

function safeFilename(filename: string): string {
  const basename = path.basename(filename).replace(/[/\\]/g, "");
  const cleaned = basename
    .replace(/\.\.+/g, ".")
    .replace(/[^\w .()-]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned && cleaned !== "." ? cleaned.slice(0, 180) : FALLBACK_FILENAME;
}

function presentAttachment(row: Record<string, unknown>): BugReportAttachment {
  return {
    id: row.id as string,
    report_id: row.report_id as string,
    filename: row.filename as string,
    content_type: row.content_type as AttachmentType,
    size: Number(row.size),
    uploaded_by: (row.uploaded_by as string | null) ?? null,
    created_at: new Date(row.created_at as Date | string).toISOString(),
  };
}

function validateFile(file: File): { filename: string; contentType: AttachmentType } {
  if (file.name.trim() === "") {
    throw new ApiError(400, "FILE_REQUIRED", "fileフィールドにファイルを指定してください");
  }
  if (file.size === 0) {
    throw new ApiError(400, "FILE_EMPTY", "中身のないファイルは送れません");
  }
  if (file.size > maxUploadBytes()) {
    throw new ApiError(400, "FILE_TOO_LARGE", `ファイルサイズは${maxUploadMb()}MB以下にしてください`);
  }

  const declaredType = file.type.trim().toLowerCase();
  const extensionType = typeFromFilename(file.name);
  if (!extensionType || !isAttachmentType(declaredType)) {
    throw new ApiError(400, "UNSUPPORTED_TYPE", "対応していないファイル形式です");
  }

  return { filename: safeFilename(file.name), contentType: declaredType };
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  if (e.code === "ENOENT") return true;
  if (e.name === "NoSuchKey" || e.name === "NotFound") return true;
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
    throw error;
  }
  if (Buffer.isBuffer(body)) return body;
  return Buffer.from(await new Response(body).arrayBuffer());
}

export async function addAttachment(
  reportId: string,
  file: File,
  { uploadedBy }: { uploadedBy: string | null },
): Promise<BugReportAttachment> {
  const { filename, contentType } = validateFile(file);
  const count = await db("ohmycms_bug_report_attachments").where({ report_id: reportId }).count();
  const currentCount = Number(count[0]?.count ?? 0);
  if (currentCount >= ATTACHMENT_MAX_COUNT) {
    throw new ApiError(400, "TOO_MANY_ATTACHMENTS", "添付できる画像の数を超えています");
  }

  const body = Buffer.from(await file.arrayBuffer());
  if (body.byteLength > maxUploadBytes()) {
    throw new ApiError(400, "FILE_TOO_LARGE", `ファイルサイズは${maxUploadMb()}MB以下にしてください`);
  }

  const id = randomUUID();
  const createdAt = new Date();
  const storageKey = `bug-reports/${reportId}/${id}/${filename}`;
  const storage = await getStorage();
  await storage.put(storageKey, body, contentType);

  try {
    await db("ohmycms_bug_report_attachments").insert({
      id,
      report_id: reportId,
      storage_key: storageKey,
      filename,
      content_type: contentType,
      size: body.byteLength,
      uploaded_by: uploadedBy,
      created_at: createdAt,
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }

  return {
    id,
    report_id: reportId,
    filename,
    content_type: contentType,
    size: body.byteLength,
    uploaded_by: uploadedBy,
    created_at: createdAt.toISOString(),
  };
}

export async function listAttachments(reportId: string): Promise<BugReportAttachment[]> {
  const rows = await db("ohmycms_bug_report_attachments")
    .select("id", "report_id", "filename", "content_type", "size", "uploaded_by", "created_at")
    .where({ report_id: reportId })
    .orderBy("created_at", "asc");
  return rows.map(presentAttachment);
}

export async function readAttachment(
  reportId: string,
  attachmentId: string,
): Promise<BugReportAttachmentBody> {
  const row = await db("ohmycms_bug_report_attachments")
    .select(
      "id",
      "report_id",
      "storage_key",
      "filename",
      "content_type",
      "size",
      "uploaded_by",
      "created_at",
    )
    .where({ id: attachmentId, report_id: reportId })
    .first();
  if (!row) throw new ApiError(404, "NOT_FOUND", "添付が見つかりません");

  const storage = await getStorage();
  const body = await bufferFromStorage(storage, row.storage_key);
  return { ...presentAttachment(row), body };
}
