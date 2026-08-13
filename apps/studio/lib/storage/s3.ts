import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { StorageDriver } from "./driver";

type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** バケットを複数環境で共有するときの接頭辞。空なら従来どおりのキーになる。 */
  keyPrefix: string;
};

/**
 * 「そのバケットがその操作を実装していない」かどうかを判定する。
 * 権限不足・通信断とは区別する（区別しないと、消えていないのに消えたことにしてしまう）。
 */
function isUnsupportedOperation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  const status =
    "$metadata" in error &&
    error.$metadata &&
    typeof error.$metadata === "object" &&
    "httpStatusCode" in error.$metadata
      ? error.$metadata.httpStatusCode
      : undefined;
  return (
    name === "NotImplemented" ||
    name === "MethodNotAllowed" ||
    name === "InvalidRequest" ||
    status === 501 ||
    status === 405
  );
}

async function bodyToBuffer(body: Buffer | ReadableStream): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  return Buffer.from(await new Response(body).arrayBuffer());
}

export function createS3Storage(config: S3Config): StorageDriver {
  // 🚨 endpoint は呼び出し側が決める。ここで R2 の URL を組み立てない
  //    （以前は決め打ちで、GCS / AWS S3 / MinIO のどれでも使えなかった）。
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  /**
   * 呼び出し側のキーへ接頭辞を付ける。
   * キー設計は `<uuid>/<ファイル名>` と `<uuid>/transformed/<hash>.<ext>` で、
   * 接頭辞はその前に付くだけ。**空なら何も変わらない**ので既存ファイルの移行は要らない。
   */
  const withPrefix = (key: string) => (config.keyPrefix ? `${config.keyPrefix}/${key}` : key);

  /**
   * 🚨 一括削除（DeleteObjects）は **S3 互換をうたっていても実装していない**ところがある。
   *
   * 代表例が **Google Cloud Storage の S3 互換モード**で、`NotImplemented`(501) を返す。
   * R2 と MinIO と AWS S3 は対応している（MinIO では実測済み）。
   * このプロジェクトは「GCP か Cloudflare」の両方に対応するのが要件なので、
   * **一括で試して、断られたら1件ずつに切り替える**。
   *
   * 一度断られたらそのプロセスでは以後1件ずつにする（毎回失敗させて往復を増やさない）。
   * 🚨 GCS では未検証（鍵をもらうまで unverified）。ここは「非対応でも消えること」を
   *    保証するための備えであって、GCS で通ったという主張ではない。
   */
  let bulkDeleteSupported = true;

  async function deleteObjects(keys: string[]): Promise<void> {
    if (bulkDeleteSupported) {
      try {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
        return;
      } catch (error) {
        if (!isUnsupportedOperation(error)) throw error;
        // 🚨 「その操作が無い」以外の失敗（権限・通信）は握りつぶさない。
        //    ここで全部フォールバックすると、権限不足を「消えたつもり」にしてしまう。
        bulkDeleteSupported = false;
      }
    }
    for (const key of keys) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    }
  }

  return {
    name: "s3",
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: withPrefix(key),
          Body: await bodyToBuffer(body),
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: withPrefix(key) }),
      );
      if (!result.Body) {
        throw new Error("S3 object body is empty");
      }
      const bytes = await result.Body.transformToByteArray();
      return Buffer.from(bytes);
    },
    async head(key) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: withPrefix(key) }),
        );
        return {
          size: result.ContentLength ?? 0,
          contentType: result.ContentType,
        };
      } catch (error) {
        const metadata = error && typeof error === "object" && "$metadata" in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          : undefined;
        if (metadata?.httpStatusCode === 404) {
          return null;
        }
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: withPrefix(key) }));
    },
    async deletePrefix(prefix) {
      let continuationToken: string | undefined;
      do {
        const listed = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: withPrefix(prefix),
            ContinuationToken: continuationToken,
          }),
        );
        const objects = listed.Contents?.map((object) => ({ Key: object.Key })).filter(
          (object): object is { Key: string } => Boolean(object.Key),
        );
        if (objects?.length) {
          await deleteObjects(objects.map((object) => object.Key));
        }
        // 🚨 IsTruncated を見る。NextContinuationToken だけで判定すると、
        //    実装によっては最後のページで空文字が返って無限ループになりうる。
        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (continuationToken);
    },
  };
}
