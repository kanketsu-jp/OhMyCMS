/**
 * S3 互換ストレージの実測ハーネス（MinIO 相手に put/get/head/delete/deletePrefix を通す）。
 *
 *   docker compose -f compose.yml -f compose.minio.yml up -d minio minio-init
 *   bun --filter @ohmycms/studio verify:s3
 *
 * 🚨 なぜ要るか: エンドポイントを外から与えられるようにした（R2 決め打ちを外した）ことを、
 *    R2 / GCS の鍵が無くても機械で確かめるため。ここが通れば
 *    「S3 互換クライアントとして正しい」ところまでは言える。
 *    GCS / AWS S3 固有の差異は鍵をもらうまで unverified。
 *
 * このスクリプトは lib/storage を**本番と同じ入口**（getStorage）から呼ぶ。
 * env の読み方ごと検証したいので、S3Client を直に組み立てないこと。
 * ただし「実際に置かれたキー」の確認だけは、ドライバを信じずに生の S3 API で見る。
 */
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getStorage, getStorageByName, getStorageStatus } from "../lib/storage/index";

const ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:3106";
const BUCKET = process.env.S3_BUCKET ?? "ohmycms";
const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID ?? "minioadmin";
const SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin";

/** S3 互換の env を一式セットする。keyPrefix だけケースごとに変える。 */
function setS3Env(options: { keyPrefix?: string; useLegacyR2Names?: boolean } = {}): void {
  for (const name of [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_REGION",
    "S3_FORCE_PATH_STYLE",
    "S3_KEY_PREFIX",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ]) {
    delete process.env[name];
  }

  process.env.S3_ENDPOINT = ENDPOINT;
  process.env.S3_REGION = "us-east-1";
  // MinIO はバケットをホスト名でなくパスで表す。
  process.env.S3_FORCE_PATH_STYLE = "true";
  if (options.keyPrefix) process.env.S3_KEY_PREFIX = options.keyPrefix;

  if (options.useLegacyR2Names) {
    // 後方互換の確認: 鍵の名前が R2_* だけでも S3 ドライバが選ばれること。
    process.env.R2_BUCKET = BUCKET;
    process.env.R2_ACCESS_KEY_ID = ACCESS_KEY_ID;
    process.env.R2_SECRET_ACCESS_KEY = SECRET_ACCESS_KEY;
  } else {
    process.env.S3_BUCKET = BUCKET;
    process.env.S3_ACCESS_KEY_ID = ACCESS_KEY_ID;
    process.env.S3_SECRET_ACCESS_KEY = SECRET_ACCESS_KEY;
  }
}

/** ドライバを信じずに、バケットへ実際に入っているキーを生の S3 API で見る。 */
const rawClient = new S3Client({
  endpoint: ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
});

async function listRawKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const listed = await rawClient.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    for (const object of listed.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys.sort();
}

async function removeRawKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await rawClient.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  );
}

async function toBuffer(body: Buffer | ReadableStream): Promise<Buffer> {
  return Buffer.isBuffer(body) ? body : Buffer.from(await new Response(body).arrayBuffer());
}

let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
}

/**
 * 1回分の往復。keyPrefix を変えて2回まわし、
 * 「接頭辞が実キーにだけ効き、呼び出し側のキーは変わらない」ことを見る。
 */
async function roundTrip(options: { keyPrefix?: string; useLegacyR2Names?: boolean }): Promise<void> {
  const label = options.useLegacyR2Names
    ? "旧 R2_* 名"
    : options.keyPrefix
      ? `接頭辞 "${options.keyPrefix}"`
      : "接頭辞なし";

  setS3Env(options);
  const storage = getStorage();
  check(`${label}: ドライバ選択`, storage.name === "s3", `name=${storage.name}`);
  if (storage.name !== "s3") return;

  // 実キー設計に合わせる（<uuid>/<ファイル名> と <uuid>/transformed/<hash>.<ext>）。
  const id = `verify-${options.keyPrefix ?? "none"}-${options.useLegacyR2Names ? "r2" : "s3"}`;
  const originalKey = `${id}/original.txt`;
  const derivedKey = `${id}/transformed/thumb.txt`;
  const payload = Buffer.from(`hello ${label}`, "utf8");
  const expectedPrefix = options.keyPrefix ? `${options.keyPrefix}/` : "";

  await storage.put(originalKey, payload, "text/plain");
  await storage.put(derivedKey, Buffer.from("derived", "utf8"), "text/plain");

  const head = await storage.head(originalKey);
  check(
    `${label}: head`,
    head !== null && head.size === payload.byteLength && head.contentType === "text/plain",
    `size=${head?.size ?? "null"} contentType=${head?.contentType ?? "null"}`,
  );

  const got = await toBuffer(await storage.get(originalKey));
  check(`${label}: get の内容一致`, got.equals(payload), `${got.byteLength} bytes`);

  // 呼び出し側は接頭辞なしのキーを渡しているのに、バケット上では接頭辞付きで入っているか。
  const rawKeys = await listRawKeys(`${expectedPrefix}${id}/`);
  check(
    `${label}: 実キーの位置`,
    rawKeys.length === 2 && rawKeys.every((key) => key.startsWith(expectedPrefix)),
    rawKeys.join(", ") || "(なし)",
  );

  await storage.delete(originalKey);
  check(`${label}: delete 後の head`, (await storage.head(originalKey)) === null, "null");

  await storage.deletePrefix?.(`${id}/`);
  const leftovers = await listRawKeys(`${expectedPrefix}${id}/`);
  check(`${label}: deletePrefix`, leftovers.length === 0, leftovers.join(", ") || "(残りなし)");
  await removeRawKeys(leftovers);
}

/** env が欠けているときは黙って S3 を使わず、ローカルへ落ちること。 */
function fallbackCases(): void {
  const cases: Array<{ label: string; env: Record<string, string> }> = [
    { label: "何も無い", env: {} },
    {
      label: "鍵はあるがエンドポイントが無い",
      env: {
        S3_BUCKET: BUCKET,
        S3_ACCESS_KEY_ID: ACCESS_KEY_ID,
        S3_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
      },
    },
    {
      label: "エンドポイントはあるが鍵が無い",
      env: { S3_ENDPOINT: ENDPOINT, S3_BUCKET: BUCKET },
    },
    {
      label: "空文字だけ入っている",
      env: {
        S3_ENDPOINT: "  ",
        S3_BUCKET: "",
        S3_ACCESS_KEY_ID: "",
        S3_SECRET_ACCESS_KEY: "",
      },
    },
  ];

  for (const testCase of cases) {
    setS3Env();
    for (const name of [
      "S3_ENDPOINT",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_REGION",
      "S3_FORCE_PATH_STYLE",
      "S3_KEY_PREFIX",
    ]) {
      delete process.env[name];
    }
    Object.assign(process.env, testCase.env);
    const storage = getStorage();
    check(`フォールバック（${testCase.label}）`, storage.name === "local", `name=${storage.name}`);
  }
}

/**
 * 🚨 「S3 へ切り替えても、切り替え前のファイルが読める」ことの実測。
 *
 * directus_files.storage に保存時のドライバ名が入っているので、読み出しはその名前で解決する。
 * ここが壊れると、**ローカル運用のまま後から S3 を設定した瞬間に過去のファイルが全部 404** になる。
 * （v0.9 の実害。切り替えるまで誰も気づけない壊れ方）
 */
async function switchoverCase(): Promise<void> {
  // 1. まだ S3 の設定が無い状態（＝ローカル運用）で1件置く。
  for (const name of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    delete process.env[name];
  }
  const before = getStorage();
  check("切替: 設定前の書き込み先", before.name === "local", `name=${before.name}`);
  const legacyKey = "verify-switchover/before.txt";
  const legacyBody = Buffer.from("切り替え前に置いたファイル", "utf8");
  await before.put(legacyKey, legacyBody, "text/plain");

  // 2. S3 を設定する（＝切り替え）。書き込み先は s3 になる。
  setS3Env();
  check("切替: 設定後の書き込み先", getStorage().name === "s3", `name=${getStorage().name}`);

  // 3. 🚨 保存時のドライバ名で読めば、切り替え前のファイルはまだ読める。
  const legacyStorage = getStorageByName("local");
  const readBack = legacyStorage ? await legacyStorage.get(legacyKey) : null;
  check(
    "切替: 切り替え前のファイルがまだ読める",
    readBack !== null && (await toBuffer(readBack)).equals(legacyBody),
    legacyStorage ? "local ドライバで取得" : "ドライバを解決できなかった",
  );

  // 4. 切り替え後に置いたファイルは s3 側で読める（両方が生きていること）。
  const newKey = "verify-switchover/after.txt";
  const newBody = Buffer.from("切り替え後に置いたファイル", "utf8");
  const current = getStorage();
  await current.put(newKey, newBody, "text/plain");
  const s3Storage = getStorageByName("s3");
  const newReadBack = s3Storage ? await s3Storage.get(newKey) : null;
  check(
    "切替: 切り替え後のファイルも読める",
    newReadBack !== null && (await toBuffer(newReadBack)).equals(newBody),
    s3Storage ? "s3 ドライバで取得" : "ドライバを解決できなかった",
  );

  // 5. 保管先が解決できないケース（設定を外した / 知らない名前）は **null**。
  //    今の設定で代わりに読ませない（別の場所を見て 404 になり原因が消えるため）。
  check("切替: 知らない保管先は null", getStorageByName("gcs-future") === null, "null");
  for (const name of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    delete process.env[name];
  }
  check(
    "切替: 設定が外れた s3 は null（今の設定で代読しない）",
    getStorageByName("s3") === null,
    "null",
  );

  // 後片付け。
  setS3Env();
  await legacyStorage?.deletePrefix?.("verify-switchover/");
  await getStorageByName("s3")?.deletePrefix?.("verify-switchover/");
}

/**
 * 🚨 「S3 を設定したつもりで、実はローカルに溜まっている」を検出できるか。
 * 本人は S3 に置いたつもりなので、**サーバを作り直した日に全部消えるまで気づけない**。
 * 秘密を出さずに気づかせられるか（名前だけ出ているか）も一緒に見る。
 */
function statusCases(): void {
  // (1) 全部そろっている → s3。バケットとホスト名は出す（秘密ではない）。
  setS3Env();
  const healthy = getStorageStatus();
  check(
    "状態: 設定が揃っていれば s3",
    healthy.driver === "s3" && healthy.bucket === BUCKET && !healthy.misconfigured,
    `driver=${healthy.driver} bucket=${healthy.bucket} host=${healthy.endpointHost}`,
  );

  // (2) 何も設定していない → local。**警告を出さない**（これは正常な状態）。
  for (const name of [
    "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY",
    "S3_REGION", "S3_FORCE_PATH_STYLE", "S3_KEY_PREFIX",
    "R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
  ]) {
    delete process.env[name];
  }
  const clean = getStorageStatus();
  check(
    "状態: 何も設定していなければ local（警告なし）",
    clean.driver === "local" && !clean.misconfigured && clean.missing.length === 0,
    `misconfigured=${clean.misconfigured}`,
  );

  // (3) 🚨 途中まで埋めた → local だが **misconfigured**。足りない名前が挙がる。
  process.env.S3_ENDPOINT = ENDPOINT;
  process.env.S3_BUCKET = BUCKET;
  const partial = getStorageStatus();
  check(
    "状態: 途中まで埋めたら検出できる",
    partial.driver === "local" &&
      partial.misconfigured &&
      partial.missing.includes("S3_ACCESS_KEY_ID") &&
      partial.missing.includes("S3_SECRET_ACCESS_KEY"),
    `missing=${partial.missing.join(",")}`,
  );

  // (4) 🚨 空文字だけ（compose の ${VAR:-} が渡す形）も「未設定」と同じ扱いにする。
  process.env.S3_ENDPOINT = "";
  process.env.S3_BUCKET = "   ";
  const blank = getStorageStatus();
  check(
    "状態: 空文字・空白は未設定と同じ",
    blank.driver === "local" && !blank.misconfigured,
    `misconfigured=${blank.misconfigured}`,
  );

  // (5) 🚨 秘密が混ざっていないこと。状態に出てよいのは名前・バケット・ホストだけ。
  setS3Env();
  const serialized = JSON.stringify(getStorageStatus());
  check(
    "状態: アクセスキーを含まない",
    !serialized.includes(ACCESS_KEY_ID) && !serialized.includes(SECRET_ACCESS_KEY),
    serialized,
  );
}

async function main(): Promise<void> {
  console.log(`endpoint=${ENDPOINT} bucket=${BUCKET}`);
  await roundTrip({});
  await roundTrip({ keyPrefix: "env-a" });
  await roundTrip({ useLegacyR2Names: true });
  await switchoverCase();
  fallbackCases();
  statusCases();

  console.log(failures === 0 ? "\nすべて通りました" : `\n落ちた項目: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
