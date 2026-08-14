import type { StorageDriver } from "./driver";
import { createLocalStorage } from "./local";
import { createS3Storage } from "./s3";
import { getSecretSetting, getSettings } from "@/lib/settings/service";

/**
 * S3 互換ストレージの設定を読む。DB が正、env は初期値。
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

type S3Parts = {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  keyPrefix: string;
};

async function readS3Parts(): Promise<S3Parts> {
  const settings = await getSettings();
  const accessKeyId = (await getSecretSetting("s3_access_key_id")) ?? readEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey =
    (await getSecretSetting("s3_secret_access_key")) ?? readEnv("R2_SECRET_ACCESS_KEY");
  const bucket = settings.s3_bucket || readEnv("R2_BUCKET");

  // エンドポイントは明示が最優先。無ければ R2 のアカウントIDから組み立てる（旧来の書き方）。
  const accountId = readEnv("R2_ACCOUNT_ID");
  const endpoint =
    settings.s3_endpoint ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  return {
    endpoint,
    region: settings.s3_region || undefined,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: settings.s3_force_path_style === "true",
    keyPrefix: settings.s3_key_prefix,
  };
}

async function readS3Env(): Promise<S3Env | null> {
  const parts = await readS3Parts();

  // どれか1つでも欠けたらローカルへフォールバックする（部分設定で中途半端に動かさない）。
  if (!parts.endpoint || !parts.bucket || !parts.accessKeyId || !parts.secretAccessKey) {
    return null;
  }

  return {
    endpoint: parts.endpoint,
    // R2 は "auto"。AWS S3 と GCS は実在のリージョンが要る。既定は R2 に合わせる。
    region: parts.region ?? "auto",
    bucket: parts.bucket,
    accessKeyId: parts.accessKeyId,
    secretAccessKey: parts.secretAccessKey,
    // MinIO など、バケットをホスト名でなくパスで表す実装向け。
    forcePathStyle: parts.forcePathStyle,
    // 🚨 1つのバケットを複数環境で共有するときに衝突させないための接頭辞。
    //    **既定は空**。空のままなら従来のキーと完全に同じになる（移行不要）。
    keyPrefix: parts.keyPrefix,
  };
}

/**
 * 「S3 を設定したつもりで、実はローカルに溜まっている」状態を検出する。
 *
 * 🚨 これが一番危ない壊れ方。**本人は S3 に置いたつもり**なので、
 *    サーバを作り直した日に全部消えるまで気づけない。
 * 🚨 compose は `${VAR:-}` で**空文字を渡す**ため、「未設定」と「空文字」が区別できない。
 *    そのため readEnv は trim して空を捨て、**空白だけの値も未設定として扱う**。
 *
 * 返すのは**環境変数の名前だけ**。値は返さない（AGENTS.md §3.7）。
 */
async function missingS3Settings(): Promise<string[]> {
  const parts = await readS3Parts();
  const missing: string[] = [];
  if (!parts.endpoint) missing.push("S3_ENDPOINT");
  if (!parts.bucket) missing.push("S3_BUCKET");
  if (!parts.accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!parts.secretAccessKey) {
    missing.push("S3_SECRET_ACCESS_KEY");
  }
  return missing;
}

/** S3 の設定が「1つでも書かれている」か（＝使うつもりがあったか）。 */
async function hasAnyS3Setting(): Promise<boolean> {
  const parts = await readS3Parts();
  return Boolean(
    parts.endpoint ||
      parts.bucket ||
      parts.accessKeyId ||
      parts.secretAccessKey ||
      parts.region ||
      parts.keyPrefix ||
      parts.forcePathStyle ||
      [
        "S3_ENDPOINT",
        "S3_BUCKET",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_REGION",
        "S3_KEY_PREFIX",
        "R2_ACCOUNT_ID",
        "R2_BUCKET",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
      ].some((name) => readEnv(name) !== undefined),
  );
}

export type StorageStatus = {
  /** いま**書き込んでいる**保管先。 */
  driver: "local" | "s3";
  /** S3 のときのバケット名。秘密ではないので出してよい。 */
  bucket: string | null;
  /** エンドポイントの**ホスト名だけ**。鍵も署名も含まない。 */
  endpointHost: string | null;
  /** 🚨 S3 を設定しかけて、要件を満たさずローカルへ落ちている状態。 */
  misconfigured: boolean;
  /** 足りない環境変数の**名前**（値は入れない）。 */
  missing: string[];
};

/**
 * 画面や診断に出すための、いまの保管先の状態。
 * 🚨 **アクセスキーは返さない**（伏せ字でも返さない）。設定画面へ出すのはここまで。
 */
export async function getStorageStatus(): Promise<StorageStatus> {
  const env = await readS3Env();
  if (env) {
    let endpointHost: string | null = null;
    try {
      endpointHost = new URL(env.endpoint).host;
    } catch {
      // 形が壊れていても、ここで落とさない（表示のための情報でしかない）。
      endpointHost = null;
    }
    return {
      driver: "s3",
      bucket: env.bucket,
      endpointHost,
      misconfigured: false,
      missing: [],
    };
  }
  const misconfigured = await hasAnyS3Setting();
  return {
    driver: "local",
    bucket: null,
    endpointHost: null,
    misconfigured,
    missing: misconfigured ? await missingS3Settings() : [],
  };
}

// 🚨 警告は**1度だけ**出す。getStorage はリクエストごとに呼ばれるので、
//    毎回出すとログが埋まり、かえって読まれなくなる。
let warnedAboutPartialConfig = false;

/** 今の設定で使う保管先。**書き込み先はこれ**。 */
export async function getStorage(): Promise<StorageDriver> {
  const env = await readS3Env();
  if (env) return createS3Storage(env);

  // 🚨 「設定したつもりで空だった」をここで気づかせる。
  //    ただし**落とさない**（起動時に外部依存でアプリを止めない）。接続の確認は使うときまで待つ。
  if (!warnedAboutPartialConfig && (await hasAnyS3Setting())) {
    warnedAboutPartialConfig = true;
    const missing = await missingS3Settings();
    console.warn(
      "[storage] S3 の設定が途中までしか埋まっていないため、ローカルへ保存します。" +
        `足りない環境変数: ${missing.join(", ")}`,
    );
  }
  return createLocalStorage();
}

/**
 * **保存したときの保管先**を名前から取る（読み出し・削除に使う）。
 *
 * 🚨 書き込みは `getStorage()`（今の設定）、読み出しと削除は **`directus_files.storage` に
 *    記録された保管先**で行う。混ぜると次が起きる:
 *
 *    ・ローカルで運用 → 後から S3 を設定 → **過去のファイルが全部読めなくなる**
 *    ・S3 へ切り替えた後にローカル時代のファイルを削除 → **S3 を見て何も消えず、ゴミが残る**
 *      （利用者は消したつもりでいる）
 *
 * 設定が外れていて解決できないときは **null を返す**。呼び出し側で「保管先が無い」と
 * はっきり失敗させること。今の設定で代わりに読むと、別の場所を見て 404 になり原因が消える。
 */
export async function getStorageByName(name: string): Promise<StorageDriver | null> {
  if (name === "local") return createLocalStorage();
  if (name === "s3") {
    const env = await readS3Env();
    return env ? createS3Storage(env) : null;
  }
  return null;
}
