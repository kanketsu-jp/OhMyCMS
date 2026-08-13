/**
 * SAML（SSO）の設定。**単一行**（`ohmycms_settings` と同じ形）。
 *
 * 🚨 契約 `AGENTS.md §3.6`: ここは `next/*` を import しない。
 *
 * ── IdP ごとに分けない ──
 * `knowledge/decisions/auth-methods.md`:「Entra ID / Google Workspace / Okta は同じ SAML」。
 * 実装は 1 本、設定は利用者が GUI で入れる。
 *
 * ── 何が秘密で、何が秘密でないか ──
 * ここに入るのは**すべて公開情報**（IdP の SSO URL / Entity ID / **公開鍵**である X.509 証明書）。
 * 🚨 **SP の秘密鍵は v1 では持たない。** 持つ日が来ても、DB ではなく環境変数へ置く。
 */

import { db } from "@/lib/db/knex";
import { ApiError } from "@/lib/schema/errors";

const SINGLE_ROW_ID = 1;

/**
 * 属性マッピングの既定値。
 *
 * 🚨 **NameID をメールに固定しない**（`auth-methods.md`）。
 *    SAML の `NameID` は永続 ID や不透明な文字列であることがあり、メールとは限らない。
 *    メールは**属性**から取る。ここに並ぶのは主要 IdP が実際に送ってくる属性名で、
 *    利用者が GUI で上書きできる。
 *
 * 出典（属性名の形）: OASIS SAML 2.0 の X.500/LDAP 属性プロファイル、
 * および Entra ID / Google Workspace / Okta が既定で送る Claim 名。
 */
export const ATTRIBUTE_DEFAULTS = {
  email: [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "urn:oid:0.9.2342.19200300.100.1.3",
    "email",
    "mail",
  ],
  firstName: [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    "urn:oid:2.5.4.42",
    "firstName",
    "givenName",
  ],
  lastName: [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
    "urn:oid:2.5.4.4",
    "lastName",
    "sn",
  ],
  groups: [
    "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
    "groups",
    "memberOf",
  ],
} as const;

export type SamlAttributeMap = {
  /** 空配列なら `ATTRIBUTE_DEFAULTS` を使う（＝利用者が何も設定していない）。 */
  email: string[];
  firstName: string[];
  lastName: string[];
  groups: string[];
};

export type SamlConfig = {
  enabled: boolean;
  idpEntityId: string | null;
  idpSsoUrl: string | null;
  /** IdP の署名検証用証明書（base64 の本体。PEM のヘッダは剥がして保持する）。 */
  idpCertificates: string[];
  /** 既定はリクエストから組み立てる。ここが埋まっているときだけ上書きする。 */
  spEntityId: string | null;
  attributes: SamlAttributeMap;
  updatedAt: string | null;
};

/** 設定が「SAML を実際に動かせる状態」か。**enabled とは別**（有効にしても項目が欠けていれば動かせない）。 */
export function isSamlUsable(config: SamlConfig): boolean {
  return Boolean(
    config.enabled &&
      config.idpEntityId &&
      config.idpSsoUrl &&
      config.idpCertificates.length > 0,
  );
}

type SamlConfigRow = {
  id: number;
  enabled: boolean;
  idp_entity_id: string | null;
  idp_sso_url: string | null;
  idp_certificates: string[] | null;
  sp_entity_id: string | null;
  attribute_email: string | null;
  attribute_first_name: string | null;
  attribute_last_name: string | null;
  attribute_groups: string | null;
  updated_at: Date | string | null;
};

/** 設定欄は 1 行 1 属性名でも、カンマ区切りでも受ける（利用者に形を覚えさせない）。 */
function splitAttributeNames(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export const EMPTY_SAML_CONFIG: SamlConfig = {
  enabled: false,
  idpEntityId: null,
  idpSsoUrl: null,
  idpCertificates: [],
  spEntityId: null,
  attributes: { email: [], firstName: [], lastName: [], groups: [] },
  updatedAt: null,
};

export async function getSamlConfig(): Promise<SamlConfig> {
  const row = await db<SamlConfigRow>("ohmycms_saml_config")
    .where({ id: SINGLE_ROW_ID })
    .first();

  if (!row) return EMPTY_SAML_CONFIG;

  return {
    enabled: Boolean(row.enabled),
    idpEntityId: row.idp_entity_id,
    idpSsoUrl: row.idp_sso_url,
    idpCertificates: Array.isArray(row.idp_certificates) ? row.idp_certificates : [],
    spEntityId: row.sp_entity_id,
    attributes: {
      email: splitAttributeNames(row.attribute_email),
      firstName: splitAttributeNames(row.attribute_first_name),
      lastName: splitAttributeNames(row.attribute_last_name),
      groups: splitAttributeNames(row.attribute_groups),
    },
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/**
 * X.509 証明書を正規化する（PEM のヘッダ・改行・空白を落として base64 の本体だけにする）。
 *
 * 🚨 IdP のメタデータからコピーすると改行や空白が混ざる。そのまま渡すと
 *    **署名検証が「証明書が読めない」で落ち、原因が署名の不一致に見える**。
 */
export function normalizeCertificate(raw: string): string {
  const body = raw
    .replace(/-{5}(BEGIN|END) CERTIFICATE-{5}/g, "")
    .replace(/\s+/g, "");

  if (!body) {
    throw new ApiError(400, "INVALID_CERTIFICATE", "証明書が空です");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    throw new ApiError(
      400,
      "INVALID_CERTIFICATE",
      "証明書は X.509（PEM または base64）で指定してください",
    );
  }
  return body;
}

/**
 * IdP のメタデータ XML から設定を読み取る。
 *
 * 利用者の運用: IdP の管理画面が配っているメタデータ（URL か XML ファイル）を貼るだけで、
 * SSO URL / Entity ID / 証明書の3つを手で写さなくてよくなる（**写し間違いが最も多い作業**）。
 *
 * 🚨 ここでは**署名検証をしない**。メタデータは管理者が自分で持ってきたものなので、
 *    信頼の起点は「管理者がその URL を選んだこと」にある。
 *    実際の防御は ACS 側（この証明書で署名を検証する）。
 */
export function parseIdpMetadata(xml: string): {
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificates: string[];
} {
  const entityId = /entityID="([^"]+)"/.exec(xml)?.[1];

  // HTTP-Redirect を優先する（AuthnRequest を GET で送るため）。無ければ POST を使う。
  const services = [
    ...xml.matchAll(/<[^>]*SingleSignOnService[^>]*>/g),
  ].map((m) => m[0]);
  const pick = (binding: string) =>
    services
      .filter((tag) => tag.includes(binding))
      .map((tag) => /Location="([^"]+)"/.exec(tag)?.[1])
      .find(Boolean);
  const ssoUrl = pick("HTTP-Redirect") ?? pick("HTTP-POST");

  // 🚨 名前空間の接頭辞を仮定しない（`ds:` / `dsig:` / 無し のどれも実在する。
  //    Keycloak は `dsig:`、Entra ID は `X509Certificate` を素で出す）。
  const certificates = [
    ...xml.matchAll(/<(?:[\w.-]+:)?X509Certificate>([\s\S]*?)<\/(?:[\w.-]+:)?X509Certificate>/g),
  ].map((m) => normalizeCertificate(m[1]));

  if (!entityId || !ssoUrl || certificates.length === 0) {
    throw new ApiError(
      400,
      "INVALID_METADATA",
      "メタデータから Entity ID・SSO URL・証明書を読み取れませんでした",
    );
  }

  // 同じ証明書が複数の用途で書かれていることがあるので重複を落とす。
  return { idpEntityId: entityId, idpSsoUrl: ssoUrl, idpCertificates: [...new Set(certificates)] };
}

export type SamlConfigInput = {
  enabled?: boolean;
  idpEntityId?: string | null;
  idpSsoUrl?: string | null;
  idpCertificates?: string[] | null;
  spEntityId?: string | null;
  attributes?: Partial<SamlAttributeMap>;
};

/** URL は http/https のみ許す（`javascript:` などを IdP の入口にしない）。 */
function validateUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, "INVALID_URL", `${field} は URL で指定してください`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ApiError(400, "INVALID_URL", `${field} は http または https で指定してください`);
  }
  return url.toString();
}

export async function updateSamlConfig(
  input: SamlConfigInput,
  updatedBy: string | null,
): Promise<SamlConfig> {
  const patch: Record<string, unknown> = {};

  if (input.enabled !== undefined) patch.enabled = Boolean(input.enabled);
  if (input.idpEntityId !== undefined) {
    patch.idp_entity_id = input.idpEntityId?.trim() || null;
  }
  if (input.idpSsoUrl !== undefined) {
    const value = input.idpSsoUrl?.trim();
    patch.idp_sso_url = value ? validateUrl(value, "SSO URL") : null;
  }
  if (input.idpCertificates !== undefined) {
    patch.idp_certificates = input.idpCertificates
      ? JSON.stringify(input.idpCertificates.map(normalizeCertificate))
      : null;
  }
  if (input.spEntityId !== undefined) patch.sp_entity_id = input.spEntityId?.trim() || null;

  if (input.attributes) {
    const join = (list: string[] | undefined) =>
      list && list.length > 0 ? list.map((s) => s.trim()).filter(Boolean).join("\n") : null;
    if (input.attributes.email !== undefined) patch.attribute_email = join(input.attributes.email);
    if (input.attributes.firstName !== undefined)
      patch.attribute_first_name = join(input.attributes.firstName);
    if (input.attributes.lastName !== undefined)
      patch.attribute_last_name = join(input.attributes.lastName);
    if (input.attributes.groups !== undefined)
      patch.attribute_groups = join(input.attributes.groups);
  }

  if (Object.keys(patch).length === 0) return getSamlConfig();

  // 🚨 「有効にする」ときだけ、動かせる状態かを確かめる。
  //    項目が欠けたまま有効にすると、利用者は SSO ボタンを押して 503 に着く。
  if (patch.enabled === true) {
    const next = { ...(await getSamlConfig()), ...toConfigShape(patch) };
    if (!isSamlUsable({ ...next, enabled: true })) {
      throw new ApiError(
        400,
        "SAML_INCOMPLETE",
        "SSO を有効にするには Entity ID・SSO URL・証明書のすべてが要ります",
      );
    }
  }

  const existing = await db("ohmycms_saml_config").where({ id: SINGLE_ROW_ID }).first();
  const payload = { ...patch, updated_at: new Date(), updated_by: updatedBy };

  if (existing) {
    await db("ohmycms_saml_config").where({ id: SINGLE_ROW_ID }).update(payload);
  } else {
    await db("ohmycms_saml_config").insert({ id: SINGLE_ROW_ID, ...payload });
  }

  return getSamlConfig();
}

/** 上の検査のために、DB の列名から `SamlConfig` の形へ寄せる（一部だけで足りる）。 */
function toConfigShape(patch: Record<string, unknown>): Partial<SamlConfig> {
  const shaped: Partial<SamlConfig> = {};
  if ("idp_entity_id" in patch) shaped.idpEntityId = patch.idp_entity_id as string | null;
  if ("idp_sso_url" in patch) shaped.idpSsoUrl = patch.idp_sso_url as string | null;
  if ("idp_certificates" in patch) {
    const raw = patch.idp_certificates;
    shaped.idpCertificates = typeof raw === "string" ? (JSON.parse(raw) as string[]) : [];
  }
  return shaped;
}

/** base64 本体を PEM に戻す。署名検証ライブラリが PEM を要求するため。 */
export function toPem(certificateBody: string): string {
  const lines = certificateBody.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}
