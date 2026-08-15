import { ApiError } from "@/lib/schema/errors";

/**
 * Google ドライブの REST クライアント（**依存ゼロ。`fetch` だけ**）。
 *
 * 🚨 `googleapis` を入れていない。ドライブは REST なので、必要な2本は素の `fetch` で足りる。
 *   このプロジェクトは外部依存で3回壊れているので、入れずに済むものは入れない。
 */

const FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";

/**
 * 取り込みで使うメタ情報。
 * 🚨 `fields=*` にしない。返る量が読めず、**要らない情報まで DB に入る**。
 *   ここに書いたものが「取得したメタ情報」の実体になる。
 */
const METADATA_FIELDS = [
  "id",
  "name",
  "mimeType",
  "size",
  "md5Checksum",
  "createdTime",
  "modifiedTime",
  "webViewLink",
  "iconLink",
  "imageMediaMetadata(width,height,rotation)",
  "owners(displayName,emailAddress)",
  "trashed",
].join(",");

export type DriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  /** ドライブは文字列で返す（大きいファイルがあるため）。数値に直して使う。 */
  size: string | null;
  md5Checksum: string | null;
  createdTime: string | null;
  modifiedTime: string | null;
  /** 「もとのファイルをみる」で開く URL。 */
  webViewLink: string | null;
  iconLink: string | null;
  imageMediaMetadata: { width?: number; height?: number; rotation?: number } | null;
  owners: Array<{ displayName?: string; emailAddress?: string }> | null;
  /** ゴミ箱に入っている。**消えてはいないが、実質リンク切れ扱い**にする。 */
  trashed: boolean;
};

/**
 * 🚨 **取り込み元が見つからない**ことを、他の失敗と区別できる形で表す。
 *   これが `source_missing` のシステムラベルを付ける唯一の根拠になる。
 *   通信断や権限切れを一緒くたにすると、**生きているファイルに「消えました」と付けてしまう**。
 */
export class DriveFileMissingError extends Error {
  constructor(public readonly fileId: string) {
    super("ドライブ上のファイルが見つかりません");
    this.name = "DriveFileMissingError";
  }
}

/**
 * 応答を判定する。
 * 🚨 **本文を投げ直さない**。Google のエラー本文にはリクエストの中身が混ざることがあり、
 *   そのまま握らずに投げると、上位の `console.error(..., error)` で漏れる。
 */
function assertOk(response: Response, fileId: string): void {
  if (response.ok) return;
  // 404 は「無い」、403 は「見えない」。どちらも取り込み元としては辿れない。
  if (response.status === 404 || response.status === 403) {
    throw new DriveFileMissingError(fileId);
  }
  if (response.status === 401) {
    throw new ApiError(401, "DRIVE_UNAUTHORIZED", "ドライブへの接続が切れています。繋ぎ直してください");
  }
  throw new ApiError(502, "DRIVE_REQUEST_FAILED", `ドライブへの要求が失敗しました (${response.status})`);
}

export async function getFileMetadata(
  accessToken: string,
  fileId: string,
): Promise<DriveFileMetadata> {
  const url = new URL(`${FILES_ENDPOINT}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", METADATA_FIELDS);
  // 共有ドライブのファイルも読めるようにする（付けないと個人ドライブしか見えない）。
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  assertOk(response, fileId);
  const payload = (await response.json()) as DriveFileMetadata;

  // 🚨 ゴミ箱の中は「まだ在るが辿れない」。取り込み後にゴミ箱へ入った場合と同じ扱いにする。
  if (payload.trashed) {
    throw new DriveFileMissingError(fileId);
  }
  return payload;
}

/**
 * 実体を取ってくる。
 * 🚨 **上限を必ず渡す**。渡さないと、ドライブ側の巨大ファイルでメモリを使い切る。
 *   アップロードの上限（50MB）と同じ値を呼び出し側から渡すこと。
 */
export async function downloadFile(
  accessToken: string,
  fileId: string,
  maxBytes: number,
): Promise<Buffer> {
  const url = new URL(`${FILES_ENDPOINT}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  assertOk(response, fileId);

  // 🚨 先に Content-Length で弾く。読み切ってから測ると、その時点でメモリを食っている。
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", "ファイルサイズが上限を超えています");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  // 🚨 Content-Length が無い・嘘のこともあるので、実物でもう一度測る。
  if (buffer.byteLength > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", "ファイルサイズが上限を超えています");
  }
  return buffer;
}

/**
 * 繋いだ Google アカウントのメールアドレス。**表示のためだけ**に使う。
 *
 * 🚨 **取れなくても連携は成功させる**（null を返す）。これは「どのアカウントに繋いだか」を
 *    画面に出すための飾りで、**飾りのために本体（連携）を落とさない**。
 * 🚨 `drive.readonly` の範囲で取れる情報。**追加のスコープを求めない**。
 */
export async function getAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as
      | { user?: { emailAddress?: string } }
      | null;
    return payload?.user?.emailAddress ?? null;
  } catch {
    return null;
  }
}
