/**
 * 秘密がサーバログへ漏れないことの実測ハーネス。
 *
 *   bun run scripts/verify-secret-safe-logging.ts
 *
 * 🚨 なぜ要るか: getSecretSetting() で取り出した S3 認証情報を使う S3 操作が失敗すると、
 *    AWS SDK v3 の例外オブジェクトは XML エラー応答の全フィールド
 *    （InvalidAccessKeyId 系なら AWSAccessKeyId を含む）を列挙可能プロパティとして持つ。
 *    これを console.error(..., error) のようにオブジェクトごとログへ渡すと、
 *    Node の既定 inspect がその秘密（アクセスキーID）までダンプしてしまう。
 *
 * 実際のネットワーク・Docker（MinIO 等）には依存しない。S3Client.prototype.send を
 * 差し替え、AWS SDK が実際に返す InvalidAccessKeyId 例外の形（name / $metadata /
 * 列挙可能な AWSAccessKeyId プロパティ）を模したエラーを注入して、
 *   1. lib/storage/s3.ts の put() が、そのエラーを安全な ApiError へ変換して投げ直すこと
 *   2. lib/schema/api.ts の errorResponse() が、想定外の例外を console.error へ渡すとき、
 *      秘密を含む列挙可能プロパティごとダンプしないこと
 * を、テストにだけ存在する架空のキー（実在しない値）で確かめる。
 *
 * このスクリプトは「いま置かれているコード」をそのまま検査する。
 *   git stash push -- lib/storage/s3.ts lib/schema/api.ts  (修正前へ戻す)
 *   bun run scripts/verify-secret-safe-logging.ts            (RED: 漏れが検出される)
 *   git stash pop                                             (修正を戻す)
 *   bun run scripts/verify-secret-safe-logging.ts            (GREEN: 全部通る)
 */
import { format } from "node:util";
import { S3Client } from "@aws-sdk/client-s3";
import { createS3Storage } from "../lib/storage/s3";
import { errorResponse } from "../lib/schema/api";
import { isApiError } from "../lib/schema/errors";

// 🚨 実在しない値。本物のAWSアカウントに存在しないダミーのアクセスキーID。
const FAKE_ACCESS_KEY_ID = "AKIAINVALIDTESTKEY0001";

let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
}

/** AWS SDK v3 が実際に投げる InvalidAccessKeyId 例外の形を模す。 */
function fakeInvalidAccessKeyIdError(): Error & Record<string, unknown> {
  const error = new Error(
    "The AWS Access Key Id you provided does not exist in our records.",
  ) as Error & Record<string, unknown>;
  error.name = "InvalidAccessKeyId";
  error.$metadata = { httpStatusCode: 403 };
  error.$fault = "client";
  // S3 の XML エラー応答がそのまま持つ拡張フィールド（列挙可能プロパティ）。
  error.AWSAccessKeyId = FAKE_ACCESS_KEY_ID;
  return error;
}

async function testStorageWrapping(): Promise<void> {
  console.log("\n■ (1) lib/storage/s3.ts: S3 操作の例外が安全な形へ変換されるか");

  type SendFn = typeof S3Client.prototype.send;
  const originalSend = S3Client.prototype.send;
  // 🚨 実際のネットワーク呼び出しを起こさない。AWS SDK が投げる例外の形だけを注入する。
  const fakeSend = (async () => {
    throw fakeInvalidAccessKeyIdError();
  }) as unknown as SendFn;

  let thrown: unknown = null;
  S3Client.prototype.send = fakeSend;
  try {
    const storage = createS3Storage({
      endpoint: "https://example-test-endpoint.invalid",
      region: "auto",
      bucket: "verify-secret-safe-logging",
      accessKeyId: "test-access-key-id-not-real",
      secretAccessKey: "test-secret-access-key-not-real",
      forcePathStyle: false,
      keyPrefix: "",
    });

    try {
      await storage.put("verify/secret-safe-logging.txt", Buffer.from("x"), "text/plain");
    } catch (error) {
      thrown = error;
    }
  } finally {
    S3Client.prototype.send = originalSend;
  }

  check("put() が例外を投げる", thrown !== null, thrown ? "投げた" : "投げなかった");
  check(
    "put() が投げるのは ApiError（STORAGE_ERROR）",
    isApiError(thrown) && thrown.code === "STORAGE_ERROR",
    isApiError(thrown) ? thrown.code : String(thrown),
  );

  const serializedThrown =
    JSON.stringify(thrown) +
    String((thrown as Error | null)?.message ?? "") +
    String((thrown as Error | null)?.stack ?? "");
  check(
    "put() が投げた例外にアクセスキーIDが含まれない",
    !serializedThrown.includes(FAKE_ACCESS_KEY_ID),
    serializedThrown.includes(FAKE_ACCESS_KEY_ID) ? "含まれていた" : "含まれていない",
  );
}

async function testErrorResponseLogging(): Promise<void> {
  console.log("\n■ (2) lib/schema/api.ts: errorResponse() の最後の砦ログ");

  const rawError = fakeInvalidAccessKeyIdError();

  const originalConsoleError = console.error;
  const capturedArgs: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    capturedArgs.push(args);
  };

  let response: Response;
  try {
    response = errorResponse(rawError);
  } finally {
    console.error = originalConsoleError;
  }

  check("errorResponse() は 500 を返す", response.status === 500, String(response.status));

  const loggedText = capturedArgs.map((args) => format(...args)).join("\n");
  check(
    "errorResponse() のログ出力にアクセスキーIDが含まれない",
    !loggedText.includes(FAKE_ACCESS_KEY_ID),
    loggedText,
  );

  const body = (await response.json()) as { error?: { message?: string } };
  check(
    "errorResponse() のレスポンス本文にアクセスキーIDが含まれない",
    !JSON.stringify(body).includes(FAKE_ACCESS_KEY_ID),
    JSON.stringify(body),
  );
}

async function main(): Promise<void> {
  await testStorageWrapping();
  await testErrorResponseLogging();
  console.log(failures === 0 ? "\nすべて通りました" : `\n落ちた項目: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
