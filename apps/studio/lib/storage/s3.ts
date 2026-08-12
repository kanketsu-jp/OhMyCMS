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
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

async function bodyToBuffer(body: Buffer | ReadableStream): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  return Buffer.from(await new Response(body).arrayBuffer());
}

export function createS3Storage(config: S3Config): StorageDriver {
  const client = new S3Client({
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    name: "s3",
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: await bodyToBuffer(body),
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
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
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
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
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
    async deletePrefix(prefix) {
      let continuationToken: string | undefined;
      do {
        const listed = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        const objects = listed.Contents?.map((object) => ({ Key: object.Key })).filter(
          (object): object is { Key: string } => Boolean(object.Key),
        );
        if (objects?.length) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: config.bucket,
              Delete: { Objects: objects },
            }),
          );
        }
        continuationToken = listed.NextContinuationToken;
      } while (continuationToken);
    },
  };
}
