import type { StorageDriver } from "./driver";
import { createLocalStorage } from "./local";
import { createS3Storage } from "./s3";

export function getStorage(): StorageDriver {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (accountId && accessKeyId && secretAccessKey && bucket) {
    return createS3Storage({ accountId, accessKeyId, secretAccessKey, bucket });
  }

  return createLocalStorage();
}
