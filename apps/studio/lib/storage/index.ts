import type { StorageDriver } from "./driver";
import { createLocalStorage } from "./local";
import { createS3Storage } from "./s3";

/**
 * S3 互換ストレージの設定を環境変数から読む。
 *
 * 対応する書き方は2つ。**どちらも同じ S3 互換クライアントに落ちる**:
 *
 *  1. 汎用 (推奨) … S3_ENDPOINT を明示する。R2 / GCS / MinIO / AWS S3 のどれでも使える
 *       S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
 *       S3_ENDPOINT=https://storage.googleapis.com          (GCS の S3 互換モード)
 *       S3_ENDPOINT=http://minio:9000                       (ローカル検証)
 *  2. R2 専用 (旧来) … R2_ACCOUNT_ID からエンドポイントを組み立てる。**後方互換のために残す**
 *
 * 🚨 以前は 2 しか無く、エンドポイントが R2 に決め打ちされていたため
 *    GCS でも AWS S3 でも MinIO でも使えなかった。v1-B でここを外した。
 */
type S3Env = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  keyPrefix: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readS3Env(): S3Env | null {
  const accessKeyId = readEnv("S3_ACCESS_KEY_ID") ?? readEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey =
    readEnv("S3_SECRET_ACCESS_KEY") ?? readEnv("R2_SECRET_ACCESS_KEY");
  const bucket = readEnv("S3_BUCKET") ?? readEnv("R2_BUCKET");

  // エンドポイントは明示が最優先。無ければ R2 のアカウントIDから組み立てる（旧来の書き方）。
  const accountId = readEnv("R2_ACCOUNT_ID");
  const endpoint =
    readEnv("S3_ENDPOINT") ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  // どれか1つでも欠けたらローカルへフォールバックする（部分設定で中途半端に動かさない）。
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    endpoint,
    // R2 は "auto"。AWS S3 と GCS は実在のリージョンが要る。既定は R2 に合わせる。
    region: readEnv("S3_REGION") ?? "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    // MinIO など、バケットをホスト名でなくパスで表す実装向け。
    forcePathStyle: readEnv("S3_FORCE_PATH_STYLE") === "true",
    // 🚨 1つのバケットを複数環境で共有するときに衝突させないための接頭辞。
    //    **既定は空**。空のままなら従来のキーと完全に同じになる（移行不要）。
    keyPrefix: readEnv("S3_KEY_PREFIX") ?? "",
  };
}

export function getStorage(): StorageDriver {
  const env = readS3Env();
  if (env) return createS3Storage(env);
  return createLocalStorage();
}
