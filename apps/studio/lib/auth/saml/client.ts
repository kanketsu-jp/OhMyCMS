/**
 * `@node-saml/node-saml` の組み立て。**署名検証は自前で書かない**（引き継ぎ書 §2-4）。
 *
 * 🚨 **既定値をそのまま使わないこと。** このライブラリの既定には、
 *    このプロジェクトの決定に**正面から反するもの**が混ざっている（下記 identifierFormat）。
 *    各項目に「なぜその値か」を書いてある。消さないこと。
 */

import { SAML } from "@node-saml/node-saml";
import type { CacheItem, CacheProvider } from "@node-saml/node-saml/lib/types";
import { db } from "@/lib/db/knex";
import { toPem, type SamlConfig } from "./config";

/** AuthnRequest の ID を覚えておく時間。IdP の画面でパスワードを入れる時間を見込む。 */
const REQUEST_TTL_MS = 30 * 60 * 1000;
const REQUEST_RATE_WINDOW_MS = 60 * 1000;
const REQUEST_RATE_LIMIT = 5;

export function samlRequestSource(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/**
 * `InResponseTo` 照合のための保管庫を **DB** にする。
 *
 * 🚨 ライブラリの既定は**プロセス内メモリ**で、再起動と多重起動のどちらでも壊れる
 *    （`20260814020100_create_ohmycms_saml_requests.ts` に理由を書いた）。
 */
function createRequestStore(source?: string): CacheProvider {
  return {
    async saveAsync(key: string, value: string): Promise<CacheItem | null> {
      const createdAt = Date.now();
      const inserted = await db.transaction(async (trx): Promise<Array<{ request_id: string }>> => {
        await trx("ohmycms_saml_requests").where("expires_at", "<", new Date(createdAt)).del();
        if (source) {
          await trx.raw("select pg_advisory_xact_lock(hashtext(?))", [source]);
          const recent = await trx("ohmycms_saml_requests")
            .where({ source })
            .where("created_at", ">", new Date(createdAt - REQUEST_RATE_WINDOW_MS))
            .count<{ count: string }>("*")
            .first();
          if (Number(recent?.count ?? 0) >= REQUEST_RATE_LIMIT) return [];
        }
        return (await trx("ohmycms_saml_requests")
          .insert({
            request_id: key,
            // 🚨 渡された値をそのまま持つ。`getAsync` はこれを返さなければならない（下記）。
            value,
            source: source ?? null,
            created_at: new Date(createdAt),
            expires_at: new Date(createdAt + REQUEST_TTL_MS),
          })
          .onConflict("request_id")
          .ignore()
          .returning("request_id")) as Array<{ request_id: string }>;
      });

      // 既にある ID は上書きしない（ライブラリの契約どおり null を返す）。
      if (inserted.length === 0) return null;
      return { value, createdAt };
    },

  /**
   * 🚨 **キーを返してはいけない。保存した値を返す。**
   *    ライブラリはこの戻り値を `new Date(値)` で**時刻として解釈**し、
   *    `requestIdExpirationPeriodMs` を足して有効かどうかを判定する。
   *    キーを返すと `Invalid Date` → `NaN` → 判定が必ず偽になり、
   *    **正しい応答が `SubjectInResponseTo is not valid` で落ちる**（実測で踏んだ。
   *    `20260814020200_add_value_to_ohmycms_saml_requests.ts` に経緯を書いた）。
   */
    async getAsync(key: string): Promise<string | null> {
      const row = (await db("ohmycms_saml_requests")
        .where({ request_id: key })
        .where("expires_at", ">", new Date())
        .first()) as { value: string | null; created_at: Date } | undefined;
      if (!row) return null;
      return row.value ?? new Date(row.created_at).toISOString();
    },

    async removeAsync(key: string | null): Promise<string | null> {
      if (!key) return null;
      const deleted = await db("ohmycms_saml_requests").where({ request_id: key }).del();
      return deleted > 0 ? key : null;
    },
  };
}

export const requestStore: CacheProvider = createRequestStore();

/** 期限切れの記録を落とす。ログインのたびに少しずつ掃除する（cron を持たないため）。 */
export async function purgeExpiredSamlRecords(): Promise<void> {
  const now = new Date();
  await db("ohmycms_saml_requests").where("expires_at", "<", now).del();
  await db("ohmycms_saml_assertions").where("expires_at", "<", now).del();
}

export type SamlEndpoints = {
  spEntityId: string;
  acsUrl: string;
};

export function createSamlClient(
  config: SamlConfig,
  endpoints: SamlEndpoints,
  source?: string,
): SAML {
  return new SAML({
    // ── SP 側 ──
    issuer: endpoints.spEntityId,
    callbackUrl: endpoints.acsUrl,

    // ── IdP 側（利用者が GUI で入れたもの）──
    entryPoint: config.idpSsoUrl ?? undefined,
    idpCert: config.idpCertificates.map(toPem),
    // 発行者の一致も見る。設定した IdP 以外が署名した応答を拒む。
    idpIssuer: config.idpEntityId ?? undefined,

    // 🚨 **NameID をメールに固定しない**（`knowledge/decisions/auth-methods.md`）。
    //    ライブラリの既定は `nameid-format:emailAddress` で、
    //    **NameIDPolicy に Format を書いて IdP にメールを要求してしまう**。
    //    Entra ID の永続 ID など、メールでない識別子を返す IdP でログインできなくなる。
    //    null にすると Format を書かず、IdP に任せる。
    identifierFormat: null,

    // ── 🔴 受入基準に直接対応する項目 ──
    // 「Audience が違うものを拒否」: 自分宛でない Assertion を弾く。
    audience: endpoints.spEntityId,
    // 「署名が無い Assertion を拒否」: Assertion 自体の署名を必須にする。
    wantAssertionsSigned: true,
    // 🚨 Response 要素そのものの署名は**必須にしない**。
    //    SAML では「Response に署名」「Assertion に署名」「両方」のいずれも仕様に適合し、
    //    IdP によって既定が違う（Keycloak は設定次第、Entra ID は Assertion のみが既定）。
    //    ここを true にすると **Assertion が正しく署名されていても弾く**ので、
    //    「安全側」ではなく「動かない側」に倒れる。急所は Assertion の署名（上の行）。
    wantAuthnResponseSigned: false,
    // 「期限切れ（NotOnOrAfter 超過）を拒否」: 時計のずれの許容を明示する。
    //    0 だと SP と IdP の時計が数秒ずれただけで落ちる。
    acceptedClockSkewMs: 60 * 1000,

    // 「こちらが出した要求への応答か」を照合する。
    // 🚨 `always` にしない。IdP 起点のログイン（IdP の画面のタイルから入る形）には
    //    `InResponseTo` が無く、**Entra ID / Okta では普通に使われる**ため入れなくなる。
    //    `ifPresent` = 付いていたら必ず照合する。付いていない場合の防御は
    //    Assertion ID のリプレイ台帳（`verify.ts`）が受け持つ。
    validateInResponseTo: "ifPresent" as SAML["options"]["validateInResponseTo"],
    cacheProvider: source ? createRequestStore(source) : requestStore,
    requestIdExpirationPeriodMs: REQUEST_TTL_MS,

    // AuthnRequest には署名しない（SP の秘密鍵を持たないため。`config.ts` の方針）。
    // 認証の強度は「IdP が署名した Assertion を検証すること」で担保される。
    privateKey: undefined,

    // IdP に認証方法を指定しない。指定すると IdP 側の設定と食い違って弾かれることがある。
    disableRequestedAuthnContext: true,
  });
}
