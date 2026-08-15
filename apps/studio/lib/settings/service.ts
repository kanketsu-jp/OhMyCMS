/**
 * 全体設定（F2 §2-A）のドメイン層。
 *
 * 🚨 契約 §2-2: ここは `next/*` を import しない（将来 Hono へ切り出す資産）。
 *    HTTP の入出力は app/api/settings/route.ts が持ち、ここは素の値だけを受け渡す。
 *
 * ── 設計の中心にある1つの決まりごと ──
 * **環境変数は「初期値」、DB の行が「正」。**
 *
 *   起動直後（設定行なし） … 環境変数 → 既定値 の順で解決する
 *   GUI で保存したあと     … DB の値が勝つ。環境変数を変えても戻らない
 *
 * これで MVP 受入基準 #2「環境変数だけで設定が完結する」と、
 * F2 受入基準 #4「起動後は GUI で上書きできる」の両方が同時に成り立つ。
 *
 * 逆にやってはいけないこと:
 *   - マイグレーションで初期行を入れる（環境変数が最初から無視される）
 *   - 環境変数を毎回 DB へ書き戻す（GUI の変更が起動のたびに巻き戻る）
 */

import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/knex";
import { ApiError } from "@/lib/schema/errors";
import { decryptSecret, encryptSecret } from "./secret-box";

/** 設定テーブルは単一行。DB 側の CHECK 制約と揃えている。 */
const SINGLE_ROW_ID = 1;

/**
 * ローカル管理者の内部用メールアドレス。
 *
 * 🚨 なぜメールがあるか: メールを使わない方針だが、`directus_sessions.user` は NOT NULL、
 *    `directus_users.email` も NOT NULL + unique という DB 制約があるため、
 *    セッションの持ち主として内部専用の固定ユーザーを1人だけ持つ。
 *    **利用者には一切見せない**（画面にもAPIレスポンスにも出さない）。
 */
export const LOCAL_ADMIN_EMAIL = "local-admin@localhost";

/** 既定値。環境変数も DB も無いときはこれで動く。 */
export const SETTINGS_DEFAULTS = {
  project_name: "OhMyCMS",
  project_color: "#111111",
  default_locale: "ja",
  public_note: "",
  tenant_name: "",
  s3_endpoint: "",
  s3_bucket: "",
  s3_region: "",
  s3_force_path_style: "false",
  s3_key_prefix: "",
  google_client_id: "",
  drive_client_id: "",
  smtp_host: "",
  smtp_port: "",
  smtp_user: "",
} as const;

export type Settings = {
  project_name: string;
  project_logo: string | null;
  project_color: string;
  default_locale: string;
  public_note: string;
  tenant_name: string;
  s3_endpoint: string;
  s3_bucket: string;
  s3_region: string;
  s3_access_key_id_set: boolean;
  s3_secret_access_key_set: boolean;
  s3_force_path_style: string;
  s3_key_prefix: string;
  google_client_id: string;
  /** Google ドライブ連携の client_id。🚨 PKCE なので秘密ではない（暗号化しない列）。 */
  drive_client_id: string;
  google_client_secret_set: boolean;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password_set: boolean;
  /** 各項目が「DB の値」なのか「環境変数・既定値」なのか。GUI が出所を出せるようにする。 */
  sources: Record<SettingsKey, SettingsSource>;
  updated_at: string | null;
};

export type SettingsSource = "database" | "environment" | "default";

export type SettingsKey =
  | "project_name"
  | "project_logo"
  | "project_color"
  | "default_locale"
  | "public_note"
  | "tenant_name"
  | "s3_endpoint"
  | "s3_bucket"
  | "s3_region"
  | "s3_access_key_id"
  | "s3_secret_access_key"
  | "s3_force_path_style"
  | "s3_key_prefix"
  | "google_client_id"
  | "drive_client_id"
  | "google_client_secret"
  | "smtp_host"
  | "smtp_port"
  | "smtp_user"
  | "smtp_password";

export type SecretSettingsKey =
  | "s3_access_key_id"
  | "s3_secret_access_key"
  | "google_client_secret"
  | "smtp_password";

const SECRET_KEYS = new Set<SettingsKey>([
  "s3_access_key_id",
  "s3_secret_access_key",
  "google_client_secret",
  "smtp_password",
]);

const SECRET_ENV: Record<SecretSettingsKey, string> = {
  s3_access_key_id: "S3_ACCESS_KEY_ID",
  s3_secret_access_key: "S3_SECRET_ACCESS_KEY",
  google_client_secret: "GOOGLE_CLIENT_SECRET",
  smtp_password: "SMTP_PASSWORD",
};

/** GUI から書き換えられる項目。ここに無いキーは PATCH で無視する。 */
const WRITABLE_KEYS: SettingsKey[] = [
  "project_name",
  "project_logo",
  "project_color",
  "default_locale",
  "public_note",
  "tenant_name",
  "s3_endpoint",
  "s3_bucket",
  "s3_region",
  "s3_access_key_id",
  "s3_secret_access_key",
  "s3_force_path_style",
  "s3_key_prefix",
  "google_client_id",
  "drive_client_id",
  "google_client_secret",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_password",
];

/** 環境変数から読む「初期値」。空文字は未設定として扱う（compose が空を渡してくるため）。 */
function fromEnvironment(): Partial<Record<SettingsKey, string>> {
  const pick = (name: string) => {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
  };
  return {
    project_name: pick("OHMYCMS_PROJECT_NAME"),
    project_color: pick("OHMYCMS_PROJECT_COLOR"),
    default_locale: pick("OHMYCMS_DEFAULT_LOCALE"),
    s3_endpoint: pick("S3_ENDPOINT"),
    s3_bucket: pick("S3_BUCKET"),
    s3_region: pick("S3_REGION"),
    s3_access_key_id: pick("S3_ACCESS_KEY_ID"),
    s3_secret_access_key: pick("S3_SECRET_ACCESS_KEY"),
    s3_force_path_style: pick("S3_FORCE_PATH_STYLE"),
    s3_key_prefix: pick("S3_KEY_PREFIX"),
    google_client_id: pick("GOOGLE_CLIENT_ID"),
    google_client_secret: pick("GOOGLE_CLIENT_SECRET"),
    smtp_host: pick("SMTP_HOST"),
    smtp_port: pick("SMTP_PORT"),
    smtp_user: pick("SMTP_USER"),
    smtp_password: pick("SMTP_PASSWORD"),
  };
}

type SettingsRow = {
  id: number;
  project_name: string | null;
  project_logo: string | null;
  project_color: string | null;
  default_locale: string | null;
  public_note: string | null;
  tenant_name: string | null;
  s3_endpoint: string | null;
  s3_bucket: string | null;
  s3_region: string | null;
  s3_access_key_id: string | null;
  s3_secret_access_key: string | null;
  s3_force_path_style: string | null;
  s3_key_prefix: string | null;
  google_client_id: string | null;
  google_client_secret: string | null;
  smtp_host: string | null;
  smtp_port: string | null;
  smtp_user: string | null;
  smtp_password: string | null;
  updated_at: Date | string | null;
  /** オンボーディングが済んだ時刻。null なら未完了。 */
  onboarding_completed_at: Date | string | null;
  /** 保存済みのセットアップパスワード(scryptハッシュ)。画面やAPIレスポンスには絶対に出さないこと。 */
  setup_password: string | null;
};

async function readRow(): Promise<SettingsRow | null> {
  const row = await db<SettingsRow>("ohmycms_settings")
    .where({ id: SINGLE_ROW_ID })
    .first();
  return row ?? null;
}

/**
 * いま有効な設定を返す。DB → 環境変数 → 既定値 の順で解決する。
 * **項目ごとに**解決するので、「project_name だけ GUI で変えた」状態でも
 * 他の項目は環境変数が効いたままになる。
 */
export async function getSettings(): Promise<Settings> {
  const row = await readRow();
  const environment = fromEnvironment();

  const resolve = (
    key: SettingsKey,
    fallback: string,
  ): { value: string; source: SettingsSource } => {
    const fromDb = row?.[key as keyof SettingsRow];
    if (typeof fromDb === "string" && fromDb.length > 0) {
      return { value: fromDb, source: "database" };
    }
    const fromEnv = environment[key];
    if (fromEnv) return { value: fromEnv, source: "environment" };
    return { value: fallback, source: "default" };
  };
  const resolveSecret = (
    key: SecretSettingsKey,
  ): { set: boolean; source: SettingsSource } => {
    const fromDb = row?.[key as keyof SettingsRow];
    if (typeof fromDb === "string" && fromDb.length > 0) {
      return { set: true, source: "database" };
    }
    const fromEnv = environment[key];
    if (fromEnv) return { set: true, source: "environment" };
    return { set: false, source: "default" };
  };

  const name = resolve("project_name", SETTINGS_DEFAULTS.project_name);
  const color = resolve("project_color", SETTINGS_DEFAULTS.project_color);
  const locale = resolve("default_locale", SETTINGS_DEFAULTS.default_locale);
  const note = resolve("public_note", SETTINGS_DEFAULTS.public_note);
  const tenant = resolve("tenant_name", SETTINGS_DEFAULTS.tenant_name);
  const s3Endpoint = resolve("s3_endpoint", SETTINGS_DEFAULTS.s3_endpoint);
  const s3Bucket = resolve("s3_bucket", SETTINGS_DEFAULTS.s3_bucket);
  const s3Region = resolve("s3_region", SETTINGS_DEFAULTS.s3_region);
  const s3AccessKeyId = resolveSecret("s3_access_key_id");
  const s3SecretAccessKey = resolveSecret("s3_secret_access_key");
  const s3ForcePathStyle = resolve(
    "s3_force_path_style",
    SETTINGS_DEFAULTS.s3_force_path_style,
  );
  const s3KeyPrefix = resolve("s3_key_prefix", SETTINGS_DEFAULTS.s3_key_prefix);
  const googleClientId = resolve("google_client_id", SETTINGS_DEFAULTS.google_client_id);
  const driveClientId = resolve("drive_client_id", SETTINGS_DEFAULTS.drive_client_id);
  const googleClientSecret = resolveSecret("google_client_secret");
  const smtpHost = resolve("smtp_host", SETTINGS_DEFAULTS.smtp_host);
  const smtpPort = resolve("smtp_port", SETTINGS_DEFAULTS.smtp_port);
  const smtpUser = resolve("smtp_user", SETTINGS_DEFAULTS.smtp_user);
  const smtpPassword = resolveSecret("smtp_password");

  return {
    project_name: name.value,
    project_logo: row?.project_logo ?? null,
    project_color: color.value,
    default_locale: locale.value,
    public_note: note.value,
    tenant_name: tenant.value,
    s3_endpoint: s3Endpoint.value,
    s3_bucket: s3Bucket.value,
    s3_region: s3Region.value,
    s3_access_key_id_set: s3AccessKeyId.set,
    s3_secret_access_key_set: s3SecretAccessKey.set,
    s3_force_path_style: s3ForcePathStyle.value,
    s3_key_prefix: s3KeyPrefix.value,
    google_client_id: googleClientId.value,
    drive_client_id: driveClientId.value,
    google_client_secret_set: googleClientSecret.set,
    smtp_host: smtpHost.value,
    smtp_port: smtpPort.value,
    smtp_user: smtpUser.value,
    smtp_password_set: smtpPassword.set,
    sources: {
      project_name: name.source,
      // ロゴは環境変数を持たない（ファイルIDなので DB にしか居ない）。
      project_logo: row?.project_logo ? "database" : "default",
      project_color: color.source,
      default_locale: locale.source,
      public_note: note.source,
      tenant_name: tenant.source,
      s3_endpoint: s3Endpoint.source,
      s3_bucket: s3Bucket.source,
      s3_region: s3Region.source,
      s3_access_key_id: s3AccessKeyId.source,
      s3_secret_access_key: s3SecretAccessKey.source,
      s3_force_path_style: s3ForcePathStyle.source,
      s3_key_prefix: s3KeyPrefix.source,
      google_client_id: googleClientId.source,
      drive_client_id: driveClientId.source,
      google_client_secret: googleClientSecret.source,
      smtp_host: smtpHost.source,
      smtp_port: smtpPort.source,
      smtp_user: smtpUser.source,
      smtp_password: smtpPassword.source,
    },
    updated_at: row?.updated_at
      ? new Date(row.updated_at).toISOString()
      : null,
  };
}

/**
 * 秘密項目の平文をサーバ内部向けに取り出す。
 * 戻り値は API レスポンスやログに絶対に出さないこと。
 */
export async function getSecretSetting(key: SecretSettingsKey): Promise<string | null> {
  const row = await readRow();
  const fromDb = row?.[key as keyof SettingsRow];
  if (typeof fromDb === "string" && fromDb.length > 0) {
    return decryptSecret(fromDb);
  }
  const fromEnv = process.env[SECRET_ENV[key]]?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

/** 保存できるロケール。i18n/config.ts の LOCALES と揃える。 */
const ALLOWED_LOCALES = ["ja", "en"];

/**
 * オンボーディングが受け取ってよい設定の鍵。
 *
 * 🚨 **ここに並べるのは「受け取ってよい」であって「必須」ではない。**
 * 送られてこなかった鍵は `completeOnboardingWithAdmin` が落とすので、
 * 画面が聞くのをやめた項目があっても 400 にならない。
 * （画面は「あとで」で何も送らないことがある。テナント名は完了画面で「あとで」と案内している側。）
 */
export const ONBOARDING_INPUT_KEYS = [
  "project_name",
  "default_locale",
  "tenant_name",
  "project_logo",
] as const;

function validate(input: Record<string, unknown>): Partial<Record<SettingsKey, string | null>> {
  const patch: Partial<Record<SettingsKey, string | null>> = {};

  for (const key of WRITABLE_KEYS) {
    if (!(key in input)) continue;
    const raw = input[key];

    // null は「DB の値を消す＝環境変数・既定値へ戻す」を意味する。
    if (raw === null) {
      patch[key] = null;
      continue;
    }
    if (typeof raw !== "string") {
      throw new ApiError(400, "INVALID_FIELD", `${key} は文字列で指定してください`);
    }
    const value = raw.trim();

    if (key === "default_locale" && value && !ALLOWED_LOCALES.includes(value)) {
      throw new ApiError(
        400,
        "INVALID_LOCALE",
        `default_locale は ${ALLOWED_LOCALES.join(" / ")} のいずれかを指定してください`,
      );
    }
    if (key === "project_name" && value.length > 255) {
      throw new ApiError(400, "INVALID_FIELD", "project_name は255文字までです");
    }
    if (key === "tenant_name" && value.length > 255) {
      throw new ApiError(400, "INVALID_FIELD", "tenant_name は255文字までです");
    }
    if (key === "project_color" && value && !/^#[0-9a-fA-F]{3,8}$/.test(value)) {
      throw new ApiError(400, "INVALID_COLOR", "project_color は #rrggbb 形式で指定してください");
    }
    if (key === "s3_endpoint" && value) {
      try {
        new URL(value);
      } catch {
        throw new ApiError(400, "INVALID_FIELD", "s3_endpoint は URL 形式で指定してください");
      }
    }
    if (key === "s3_force_path_style" && value && value !== "true" && value !== "false") {
      throw new ApiError(400, "INVALID_FIELD", "s3_force_path_style は true / false で指定してください");
    }
    if (key === "smtp_port" && value) {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new ApiError(400, "INVALID_FIELD", "smtp_port は 1〜65535 の整数で指定してください");
      }
    }
    // 空文字は「消す」と同じ扱いにする（GUI の入力欄を空にしたら初期値へ戻る）。
    patch[key] = value.length > 0 ? value : null;
  }

  return patch;
}

/**
 * 設定を更新する。行が無ければ作る（upsert）。
 * @param input GUI から来た差分。書けないキーは黙って無視する
 * @param updatedBy 更新した人。監査のため残す
 */
export async function updateSettings(
  input: Record<string, unknown>,
  updatedBy: string | null,
): Promise<Settings> {
  const patch = validate(input);

  if (Object.keys(patch).length === 0) {
    // 何も指定されていないなら書かない（updated_at だけが動くのを避ける）。
    return getSettings();
  }

  const encryptedPatch: Partial<Record<SettingsKey, string | null>> = {};
  for (const [key, value] of Object.entries(patch) as [SettingsKey, string | null][]) {
    encryptedPatch[key] =
      value !== null && SECRET_KEYS.has(key) ? encryptSecret(value) : value;
  }

  const existing = await readRow();
  const payload = { ...encryptedPatch, updated_at: new Date(), updated_by: updatedBy };

  if (existing) {
    await db("ohmycms_settings").where({ id: SINGLE_ROW_ID }).update(payload);
  } else {
    await db("ohmycms_settings").insert({ id: SINGLE_ROW_ID, ...payload });
  }

  return getSettings();
}

/**
 * オンボーディング（初回ログイン時に1回だけ出る画面）が済んでいるか。
 *
 * 🚨 **行が無い＝未完了**。マイグレーションで初期行を入れていないので、
 *    起動直後は行そのものが無い（このファイル冒頭の「環境変数は初期値・DB が正」を参照）。
 */
export async function isOnboardingCompleted(): Promise<boolean> {
  const row = await readRow();
  return Boolean(row?.onboarding_completed_at);
}

/** local-admin ユーザーのIDを返す。居なければ null。 */
export async function localAdminUserId(): Promise<string | null> {
  const row = await db("directus_users")
    .select("id")
    .where({ email: LOCAL_ADMIN_EMAIL })
    .first();
  return row?.id ?? null;
}

/** 保存済みのセットアップパスワード（scryptハッシュ）。無ければ null。画面やAPIレスポンスへは絶対に出さないこと。 */
export async function storedSetupPasswordHash(): Promise<string | null> {
  const row = await readRow();
  return row?.setup_password ?? null;
}

/**
 * セットアップパスワードを保存する（scryptでハッシュ化してから入れる）。
 * `trx`を渡せばそのトランザクション内で書く（省略時は単独で書く）。
 */
export async function saveSetupPassword(
  plain: string,
  trx?: Knex.Transaction,
): Promise<void> {
  const runner = trx ?? db;
  const hash = await hashPassword(plain);
  const existing = await runner("ohmycms_settings")
    .where({ id: SINGLE_ROW_ID })
    .first();
  if (existing) {
    await runner("ohmycms_settings")
      .where({ id: SINGLE_ROW_ID })
      .update({ setup_password: hash });
  } else {
    await runner("ohmycms_settings").insert({ id: SINGLE_ROW_ID, setup_password: hash });
  }
}

/**
 * オンボーディングの入力を保存し、完了として印を付ける。
 *
 * 🚨 **一度完了したら二度と受け付けない。** そうしないと、この API を叩くだけで
 *    設定を上書きできてしまう（オンボーディングは認可の軽い入口なので、
 *    「初回だけ」という制約そのものが防御になっている）。
 *
 * `onboarding_completed_at` は `WRITABLE_KEYS` に入れていないため、
 * 通常の設定 PATCH からは書けない。ここだけが書き込む経路。
 */
export async function completeOnboarding(
  input: Record<string, unknown>,
  updatedBy: string | null,
): Promise<Settings> {
  if (await isOnboardingCompleted()) {
    throw new ApiError(
      409,
      "ONBOARDING_ALREADY_COMPLETED",
      "初期設定は完了しています",
    );
  }

  const patch = validate(input);
  const existing = await readRow();
  const payload = {
    ...patch,
    onboarding_completed_at: new Date(),
    updated_at: new Date(),
    updated_by: updatedBy,
  };

  if (existing) {
    await db("ohmycms_settings").where({ id: SINGLE_ROW_ID }).update(payload);
  } else {
    await db("ohmycms_settings").insert({ id: SINGLE_ROW_ID, ...payload });
  }

  return getSettings();
}

export async function completeOnboardingWithAdmin(
  input: Record<string, unknown>,
): Promise<{ userId: string }> {
  if (await isOnboardingCompleted()) {
    throw new ApiError(
      409,
      "ONBOARDING_ALREADY_COMPLETED",
      "初期設定は完了しています",
    );
  }

  const newPassword = input.new_password;
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    throw new ApiError(
      400,
      "INVALID_FIELD",
      "new_password は8文字以上で指定してください",
    );
  }

  // 🚨 **オブジェクトリテラルに並べない。** `validate()` は `key in input` で
  //    「送られてこなかった鍵」を飛ばす作りだが、リテラルに並べると
  //    **送られてこなかった鍵も「在る（値は undefined）」になり、その瞬間に全部が必須**になる。
  //    2026-08-15 に実際にこれで壊れた: `7b923d9` がフォームから tenant_name を外したあと、
  //    「はじめる」は tenant_name で、「あとで」は project_name で 400 になり、
  //    **新規インストールで初期設定を一度も終えられなかった**
  //    （:3101 / :3102 / :3103 はどれも完了済みで /onboarding が 307 になるため、
  //      共有環境では誰もこの経路に到達できず、一日気づかれなかった）。
  //    → **送られてきた鍵だけを通す。** 値の検証は今までどおり validate() が行う。
  //    守り手: scripts/check-onboarding-contract.mjs（フォームが送らない鍵を必須にすると落ちる）
  const picked: Record<string, unknown> = {};
  for (const key of ONBOARDING_INPUT_KEYS) {
    if (key in input) picked[key] = input[key];
  }
  const patch = validate(picked);

  // 🚨 directus_users.password と ohmycms_settings.setup_password を同じハッシュにする。
  //    別々にハッシュ化すると（scryptはソルトがランダムなので）異なる文字列になり、
  //    「パスワードを変えたのに setup_password 側だけ古いまま」を作れてしまう。
  const passwordHash = await hashPassword(newPassword);

  return db.transaction(async (trx) => {
    const row = await trx<SettingsRow>("ohmycms_settings")
      .where({ id: SINGLE_ROW_ID })
      .first();
    if (row?.onboarding_completed_at) {
      throw new ApiError(
        409,
        "ONBOARDING_ALREADY_COMPLETED",
        "初期設定は完了しています",
      );
    }

    const existingPolicy = await trx<{ id: string }>("directus_policies")
      .select("id")
      .where("name", "Administrator")
      .first();
    const policyId = existingPolicy?.id ?? randomUUID();

    if (!existingPolicy) {
      await trx("directus_policies").insert({
        id: policyId,
        name: "Administrator",
        description: "管理者ポリシー",
        ip_access: null,
        app_access: true,
        admin_access: true,
        enforce_tfa: false,
      });
    }

    const existingUser = await trx("directus_users")
      .select("id")
      .where({ email: LOCAL_ADMIN_EMAIL })
      .first();
    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      await trx("directus_users")
        .where({ id: userId })
        .update({ password: passwordHash, status: "active" });
    } else {
      userId = randomUUID();
      await trx("directus_users").insert({
        id: userId,
        first_name: null,
        last_name: null,
        email: LOCAL_ADMIN_EMAIL,
        password: passwordHash,
        status: "active",
        role: null,
        token: null,
        last_access: null,
        provider: "local",
        external_identifier: null,
        auth_data: null,
      });
    }

    const existingAccess = await trx("directus_access")
      .select("id")
      .where({ user: userId, policy: policyId })
      .first();

    if (!existingAccess) {
      await trx("directus_access").insert({
        id: randomUUID(),
        user: userId,
        role: null,
        policy: policyId,
        sort: null,
      });
    }

    const payload = {
      ...patch,
      setup_password: passwordHash,
      onboarding_completed_at: new Date(),
      updated_at: new Date(),
      updated_by: userId,
    };

    if (row) {
      await trx("ohmycms_settings").where({ id: SINGLE_ROW_ID }).update(payload);
    } else {
      await trx("ohmycms_settings").insert({ id: SINGLE_ROW_ID, ...payload });
    }

    return { userId };
  });
}
