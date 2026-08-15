import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { uploadFile, type PublicFileRow } from "@/lib/files/service";
import { ApiError } from "@/lib/schema/errors";
import { DriveFileMissingError, downloadFile, getFileMetadata } from "./client";
import { getAccessTokenFor } from "./tokens";

/** 取り込みの上限。`lib/files/service.ts` の MAX_UPLOAD_SIZE と同じ 50MB に揃える。 */
const MAX_IMPORT_SIZE = 50 * 1024 * 1024;

/**
 * ドライブのファイルを**複製して取り込む**。
 *
 * 🚨 **参照ではなく複製**。ドライブ側で消されても、こちらのファイルは残る。
 *    その代わり「元が消えた」ことは分からなくなるので、**取り込み元の情報を metadata に残し**、
 *    後から辿れるようにする（「もとのファイルをみる」）。
 *
 * 🚨 **アクセストークンはこの関数の中だけ**。戻り値にも metadata にも入れない。
 */

/** metadata に入れる形。🚨 **利用者に見せてよいものだけ**（この列は API に載る）。 */
export type DriveSource = {
  provider: "google-drive";
  fileId: string;
  /** 「もとのファイルをみる」で開く URL。 */
  webViewLink: string | null;
  /** 取り込み元の所有者（表示用）。 */
  ownerName: string | null;
  ownerEmail: string | null;
  createdTime: string | null;
  modifiedTime: string | null;
  md5Checksum: string | null;
  /** 取り込んだ時刻。**元の更新時刻と混ぜない**（どちらも要る）。 */
  importedAt: string;
};

async function systemLabelId(systemKey: string): Promise<string | null> {
  const row = await db("ohmycms_labels")
    .where({ system_key: systemKey })
    .select("id")
    .first<{ id: string } | undefined>();
  return row?.id ?? null;
}

/**
 * 🚨 システムラベルを付ける。**利用者の付け外しとは別経路**（置き換えではなく追加）。
 *    ここで `setLabelsForTarget` を使うと、利用者が付けたラベルを消してしまう。
 */
async function attachSystemLabel(
  fileId: string,
  systemKey: string,
  userId: string | null,
): Promise<void> {
  const labelId = await systemLabelId(systemKey);
  // 🚨 ラベルが無くても取り込みは成功させる（印が付かないだけ）。
  if (!labelId) return;
  await db("ohmycms_label_assignments")
    .insert({
      label_id: labelId,
      target_type: "file",
      target_id: fileId,
      created_by: userId,
    })
    .onConflict(["label_id", "target_type", "target_id"])
    .ignore();
}

export type ImportFromDriveInput = {
  fileId: string;
  folder?: string | null;
  /** 配信用の圧縮版を作るか（通常のアップロードと同じ既定）。 */
  compress?: boolean;
};

export async function importFromDrive(
  actor: Actor,
  clientId: string,
  input: ImportFromDriveInput,
): Promise<PublicFileRow> {
  const userId = actor.type === "human" ? actor.userId : actor.onBehalfOf;
  if (!input.fileId || typeof input.fileId !== "string") {
    throw new ApiError(400, "INVALID_FIELD", "ドライブのファイル ID を指定してください");
  }

  // 🚨 短命のアクセストークン。ここから外へ渡さない。
  const accessToken = await getAccessTokenFor(userId, clientId);

  let metadata;
  try {
    metadata = await getFileMetadata(accessToken, input.fileId);
  } catch (error) {
    // 🚨 「取り込み元が無い」と「通信が失敗した」を混ぜない。
    //    ここで混ぜると、生きているファイルに「消えました」と付けることになる。
    if (error instanceof DriveFileMissingError) {
      throw new ApiError(
        404,
        "DRIVE_FILE_NOT_FOUND",
        "ドライブ上でファイルが見つかりません（消されたか、共有されていません）",
      );
    }
    throw error;
  }

  // 🚨 上限を必ず渡す。渡さない口が無いのは「いくらでも落とせる」を防ぐ設計。
  //    アップロードと同じ上限に揃える（取り込みだけ大きいと、片方の制限が意味を失う）。
  const body = await downloadFile(accessToken, input.fileId, MAX_IMPORT_SIZE);

  const source: DriveSource = {
    provider: "google-drive",
    fileId: metadata.id,
    webViewLink: metadata.webViewLink,
    ownerName: metadata.owners?.[0]?.displayName ?? null,
    ownerEmail: metadata.owners?.[0]?.emailAddress ?? null,
    createdTime: metadata.createdTime,
    modifiedTime: metadata.modifiedTime,
    md5Checksum: metadata.md5Checksum,
    importedAt: new Date().toISOString(),
  };

  const row = await uploadFile(actor, {
    filename: metadata.name,
    contentType: metadata.mimeType,
    body,
    folder: input.folder ?? null,
    compress: input.compress,
    metadata: { drive: source },
  });

  // 🚨 取り込んだ印。**要件の「システムラベル」が実際に使われる最初の経路**。
  await attachSystemLabel(row.id, "imported", userId);
  // 🚨 ここに「ゴミ箱なら source_missing」を書いていたが、**到達しないコードだった**。
  //    `getFileMetadata` はゴミ箱のファイルを `DriveFileMissingError` にするので、
  //    この行まで来た時点で trashed ではない。**読んだ人が「ゴミ箱のものも取り込める」と
  //    誤解する嘘のコード**なので消した。
  //    `source_missing` は「**取り込んだ後に元が消えた**」を検出する仕組みで使う（未実装）。

  return row;
}
