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
import { db } from "../lib/db/knex";
import {
  getStorage,
  getStorageByName,
  getStorageStatus,
} from "../lib/storage/index";

const ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:3106";

/**
 * 🚨 **本番のバケットに対して走らせない。**
 *
 * このハーネスは put / delete / deletePrefix を実際に行う（＝**書いて消す**）。
 * 本番は R2 を使っていて、**バケット名が検証用と同じ `ohmycms`** なので、
 * `S3_ENDPOINT` を差し替えたまま実行すると**本番のデータを触る**。
 *
 * そこで「ローカルの検証用エンドポイントか」を見て、違えば止める。
 * どうしても外部のバケットで確かめたいとき（R2 の疎通確認など）は
 * **使い捨てのバケットを用意して** `--allow-remote` を明示すること。
 */
function assertLocalEndpoint(): void {
  if (process.argv.includes("--allow-remote")) {
    console.log(
      "🚨 --allow-remote が指定されています。**使い捨てのバケットか確かめてから**続けてください。",
    );
    return;
  }
  let host = "";
  try {
    host = new URL(ENDPOINT).hostname;
  } catch {
    host = "";
  }
  const localHosts = [
    "localhost",
    "127.0.0.1",
    "::1",
    "minio",
    "ohmycms-minio",
  ];
  if (localHosts.includes(host)) return;

  console.error(
    `このハーネスは書き込みと削除を行います。ローカルの検証用ストレージ以外へは向けません（endpoint のホスト: ${host || "解釈できません"}）。\n` +
      "本番のバケットと検証用のバケットは同じ名前（ohmycms）なので、取り違えるとデータを壊します。\n" +
      "外部のバケットで確かめるときは、使い捨てのバケットを用意して --allow-remote を付けてください。",
  );
  process.exit(2);
}
const BUCKET = process.env.S3_BUCKET ?? "ohmycms";
const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID ?? "minioadmin";
const SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin";

/** S3 互換の env を一式セットする。keyPrefix だけケースごとに変える。 */
function setS3Env(
  options: { keyPrefix?: string; useLegacyR2Names?: boolean } = {},
): void {
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
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function listRawKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const listed = await rawClient.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of listed.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined;
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

/**
 * 🚨 **自分が作ったものは、落ちても必ず消す。**
 *
 * 検査の途中で例外が出るとバケットに残骸が残り、**次回の実測を誤らせる**
 * （「実キーの位置」は件数を見ているので、残骸があるだけで FAIL する）。
 * ドライバの不具合に引きずられないよう、後片付けは**生の S3 API**で行う。
 * 共有資源を触る検査の作法として、受入側（sdk）とも揃えている。
 */
async function cleanupPrefix(prefix: string): Promise<void> {
  try {
    await removeRawKeys(await listRawKeys(prefix));
  } catch {
    // 後片付けの失敗で検査結果を塗り替えない（残骸は次回の一覧で見える）。
  }
}

async function toBuffer(body: Buffer | ReadableStream): Promise<Buffer> {
  return Buffer.isBuffer(body)
    ? body
    : Buffer.from(await new Response(body).arrayBuffer());
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
async function roundTrip(options: {
  keyPrefix?: string;
  useLegacyR2Names?: boolean;
}): Promise<void> {
  const label = options.useLegacyR2Names
    ? "旧 R2_* 名"
    : options.keyPrefix
      ? `接頭辞 "${options.keyPrefix}"`
      : "接頭辞なし";

  setS3Env(options);
  const storage = await getStorage();
  check(
    `${label}: ドライバ選択`,
    storage.name === "s3",
    `name=${storage.name}`,
  );
  if (storage.name !== "s3") return;

  // 実キー設計に合わせる（<uuid>/<ファイル名> と <uuid>/transformed/<hash>.<ext>）。
  const id = `verify-${options.keyPrefix ?? "none"}-${options.useLegacyR2Names ? "r2" : "s3"}`;
  const cleanupTarget = options.keyPrefix
    ? `${options.keyPrefix}/${id}/`
    : `${id}/`;
  try {
    const originalKey = `${id}/original.txt`;
    const derivedKey = `${id}/transformed/thumb.txt`;
    const payload = Buffer.from(`hello ${label}`, "utf8");
    const expectedPrefix = options.keyPrefix ? `${options.keyPrefix}/` : "";

    await storage.put(originalKey, payload, "text/plain");
    await storage.put(derivedKey, Buffer.from("derived", "utf8"), "text/plain");

    const head = await storage.head(originalKey);
    check(
      `${label}: head`,
      head !== null &&
        head.size === payload.byteLength &&
        head.contentType === "text/plain",
      `size=${head?.size ?? "null"} contentType=${head?.contentType ?? "null"}`,
    );

    const got = await toBuffer(await storage.get(originalKey));
    check(
      `${label}: get の内容一致`,
      got.equals(payload),
      `${got.byteLength} bytes`,
    );

    // 呼び出し側は接頭辞なしのキーを渡しているのに、バケット上では接頭辞付きで入っているか。
    const rawKeys = await listRawKeys(`${expectedPrefix}${id}/`);
    check(
      `${label}: 実キーの位置`,
      rawKeys.length === 2 &&
        rawKeys.every((key) => key.startsWith(expectedPrefix)),
      rawKeys.join(", ") || "(なし)",
    );

    await storage.delete(originalKey);
    check(
      `${label}: delete 後の head`,
      (await storage.head(originalKey)) === null,
      "null",
    );

    await storage.deletePrefix?.(`${id}/`);
    const leftovers = await listRawKeys(`${expectedPrefix}${id}/`);
    check(
      `${label}: deletePrefix`,
      leftovers.length === 0,
      leftovers.join(", ") || "(残りなし)",
    );
  } finally {
    // 🚨 判定が落ちても・例外が出ても、自分が置いたものは消す。
    await cleanupPrefix(cleanupTarget);
  }
}

/** env が欠けているときは黙って S3 を使わず、ローカルへ落ちること。 */
async function fallbackCases(): Promise<void> {
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
    const storage = await getStorage();
    check(
      `フォールバック（${testCase.label}）`,
      storage.name === "local",
      `name=${storage.name}`,
    );
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
  for (const name of [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]) {
    delete process.env[name];
  }
  const before = await getStorage();
  check(
    "切替: 設定前の書き込み先",
    before.name === "local",
    `name=${before.name}`,
  );
  const legacyKey = "verify-switchover/before.txt";
  const legacyBody = Buffer.from("切り替え前に置いたファイル", "utf8");
  await before.put(legacyKey, legacyBody, "text/plain");

  // 2. S3 を設定する（＝切り替え）。書き込み先は s3 になる。
  setS3Env();
  const after = await getStorage();
  check("切替: 設定後の書き込み先", after.name === "s3", `name=${after.name}`);

  // 3. 🚨 保存時のドライバ名で読めば、切り替え前のファイルはまだ読める。
  const legacyStorage = await getStorageByName("local");
  const readBack = legacyStorage ? await legacyStorage.get(legacyKey) : null;
  check(
    "切替: 切り替え前のファイルがまだ読める",
    readBack !== null && (await toBuffer(readBack)).equals(legacyBody),
    legacyStorage ? "local ドライバで取得" : "ドライバを解決できなかった",
  );

  // 4. 切り替え後に置いたファイルは s3 側で読める（両方が生きていること）。
  const newKey = "verify-switchover/after.txt";
  const newBody = Buffer.from("切り替え後に置いたファイル", "utf8");
  const current = await getStorage();
  await current.put(newKey, newBody, "text/plain");
  const s3Storage = await getStorageByName("s3");
  const newReadBack = s3Storage ? await s3Storage.get(newKey) : null;
  check(
    "切替: 切り替え後のファイルも読める",
    newReadBack !== null && (await toBuffer(newReadBack)).equals(newBody),
    s3Storage ? "s3 ドライバで取得" : "ドライバを解決できなかった",
  );

  // 5. 保管先が解決できないケース（設定を外した / 知らない名前）は **null**。
  //    今の設定で代わりに読ませない（別の場所を見て 404 になり原因が消えるため）。
  check(
    "切替: 知らない保管先は null",
    (await getStorageByName("gcs-future")) === null,
    "null",
  );
  for (const name of [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]) {
    delete process.env[name];
  }
  check(
    "切替: 設定が外れた s3 は null（今の設定で代読しない）",
    (await getStorageByName("s3")) === null,
    "null",
  );

  // 後片付け（ローカル側はドライバで、S3 側は生の API で消す）。
  setS3Env();
  await legacyStorage?.deletePrefix?.("verify-switchover/");
  await cleanupPrefix("verify-switchover/");
}

/**
 * 🚨 「S3 を設定したつもりで、実はローカルに溜まっている」を検出できるか。
 * 本人は S3 に置いたつもりなので、**サーバを作り直した日に全部消えるまで気づけない**。
 * 秘密を出さずに気づかせられるか（名前だけ出ているか）も一緒に見る。
 */
async function statusCases(): Promise<void> {
  // (1) 全部そろっている → s3。バケットとホスト名は出す（秘密ではない）。
  setS3Env();
  const healthy = await getStorageStatus();
  check(
    "状態: 設定が揃っていれば s3",
    healthy.driver === "s3" &&
      healthy.bucket === BUCKET &&
      !healthy.misconfigured,
    `driver=${healthy.driver} bucket=${healthy.bucket} host=${healthy.endpointHost}`,
  );

  // (2) 何も設定していない → local。**警告を出さない**（これは正常な状態）。
  for (const name of [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_REGION",
    "S3_FORCE_PATH_STYLE",
    "S3_KEY_PREFIX",
    "R2_ACCOUNT_ID",
    "R2_BUCKET",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ]) {
    delete process.env[name];
  }
  const clean = await getStorageStatus();
  check(
    "状態: 何も設定していなければ local（警告なし）",
    clean.driver === "local" &&
      !clean.misconfigured &&
      clean.missing.length === 0,
    `misconfigured=${clean.misconfigured}`,
  );

  // (3) 🚨 途中まで埋めた → local だが **misconfigured**。足りない名前が挙がる。
  process.env.S3_ENDPOINT = ENDPOINT;
  process.env.S3_BUCKET = BUCKET;
  const partial = await getStorageStatus();
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
  const blank = await getStorageStatus();
  check(
    "状態: 空文字・空白は未設定と同じ",
    blank.driver === "local" && !blank.misconfigured,
    `misconfigured=${blank.misconfigured}`,
  );

  // (5) 🚨 秘密が混ざっていないこと。状態に出てよいのは名前・バケット・ホストだけ。
  setS3Env();
  const serialized = JSON.stringify(await getStorageStatus());
  check(
    "状態: アクセスキーを含まない",
    !serialized.includes(ACCESS_KEY_ID) &&
      !serialized.includes(SECRET_ACCESS_KEY),
    serialized,
  );
}

/**
 * 🚨 **どちらのアドレスの付け方で通るか**を、実際に置いて確かめる。
 *
 * S3 互換には2つの流儀があり、**相手によって通る方が違う**:
 *   仮想ホスト形式  https://<バケット>.<ホスト>/<キー>   … AWS S3 の既定
 *   パス形式        https://<ホスト>/<バケット>/<キー>   … MinIO はこちら（S3_FORCE_PATH_STYLE=true）
 *
 * R2 / GCS でどちらが要るかは**鍵をもらうまで分からない**。推測で .env を書くと、
 * 仮想ホスト形式で存在しないホスト名を引いて **DNS で落ちる**（原因が分かりにくい）。
 * このモードは両方で1件ずつ置いてみて、**通った方を名指しで報告する**。
 *
 *   bun --filter @ohmycms/studio verify:s3 --probe-path-style
 */
async function probePathStyle(): Promise<void> {
  console.log("\n■ アドレスの付け方（S3_FORCE_PATH_STYLE）の判定");
  for (const forcePathStyle of [true, false]) {
    setS3Env();
    process.env.S3_FORCE_PATH_STYLE = String(forcePathStyle);
    const storage = await getStorage();
    const key = `verify-path-style/${forcePathStyle ? "path" : "virtual"}.txt`;
    const payload = Buffer.from("probe", "utf8");
    try {
      await storage.put(key, payload, "text/plain");
      const head = await storage.head(key);
      const ok = head !== null && head.size === payload.byteLength;
      console.log(
        `   ${ok ? "通る  " : "通らない"} S3_FORCE_PATH_STYLE=${String(forcePathStyle).padEnd(5)} ` +
          `（${forcePathStyle ? "パス形式" : "仮想ホスト形式"}）`,
      );
      await cleanupPrefix("verify-path-style/");
    } catch (error) {
      // 🚨 例外の中身まで出す。DNS で落ちたのか、署名が合わないのかで対処が変わる。
      const message = error instanceof Error ? error.message : "不明";
      console.log(
        `   通らない S3_FORCE_PATH_STYLE=${String(forcePathStyle).padEnd(5)} ` +
          `（${forcePathStyle ? "パス形式" : "仮想ホスト形式"}）: ${message}`,
      );
    }
  }
  console.log("   → 通った方を .env の S3_FORCE_PATH_STYLE に書くこと。");
}

/**
 * 大きいファイルの往復。**上限（50MB）の近くで切れないか**を見る。
 * 相手によっては分割アップロードの扱いが違うので、鍵が来たら実物で1度は通す。
 *
 *   bun --filter @ohmycms/studio verify:s3 --large 30
 */
async function largeFileCase(megabytes: number): Promise<void> {
  console.log(`\n■ 大きいファイルの往復（${megabytes}MB）`);
  setS3Env();
  const storage = await getStorage();
  const key = "verify-large/blob.bin";
  // 圧縮で誤魔化されないよう、繰り返しの少ないバイト列にする。
  const payload = Buffer.alloc(megabytes * 1024 * 1024);
  for (let i = 0; i < payload.length; i += 1)
    payload[i] = (i * 31 + (i >> 8)) & 0xff;

  const startedPut = performance.now();
  await storage.put(key, payload, "application/octet-stream");
  const putMs = performance.now() - startedPut;

  const head = await storage.head(key);
  check(
    "大きいファイル: head のサイズが一致",
    head?.size === payload.byteLength,
    `${head?.size ?? "null"}B`,
  );

  const startedGet = performance.now();
  const got = await toBuffer(await storage.get(key));
  const getMs = performance.now() - startedGet;
  check(
    "大きいファイル: 内容が一致（先頭・末尾・長さ）",
    got.byteLength === payload.byteLength && got.equals(payload),
    `${got.byteLength}B  put ${putMs.toFixed(0)}ms / get ${getMs.toFixed(0)}ms`,
  );
  // 🚨 大きいファイルこそ残すとバケットを圧迫する。生の API で確実に消す。
  await cleanupPrefix("verify-large/");
}

async function main(): Promise<void> {
  // 🚨 何かを書く前に、向き先がローカルの検証用かを確かめる。
  assertLocalEndpoint();
  console.log(`endpoint=${ENDPOINT} bucket=${BUCKET}`);

  // 🚨 R2 / GCS の鍵が来たときに使うモード。既定の往復とは別に呼ぶ。
  if (process.argv.includes("--probe-path-style")) {
    await probePathStyle();
    await db.destroy();
    return;
  }
  const largeIndex = process.argv.indexOf("--large");
  if (largeIndex !== -1) {
    await largeFileCase(Number(process.argv[largeIndex + 1] ?? 10) || 10);
    console.log(
      failures === 0 ? "\nすべて通りました" : `\n落ちた項目: ${failures}`,
    );
    await db.destroy();
    process.exit(failures === 0 ? 0 : 1);
  }
  await roundTrip({});
  await roundTrip({ keyPrefix: "env-a" });
  await roundTrip({ useLegacyR2Names: true });
  await switchoverCase();
  await fallbackCases();
  await statusCases();

  console.log(
    failures === 0 ? "\nすべて通りました" : `\n落ちた項目: ${failures}`,
  );
  await db.destroy();
  process.exit(failures === 0 ? 0 : 1);
}

await main();
