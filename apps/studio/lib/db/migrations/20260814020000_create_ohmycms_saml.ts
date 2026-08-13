import type { Knex } from "knex";

/**
 * SAML（SSO）の設定と、リプレイ防止のための Assertion 台帳。
 *
 * ── なぜ設定を DB に置けるか（秘密ではないから）──
 * SAML の IdP 設定は **公開情報**しか含まない。
 *   ・IdP の SSO URL / Entity ID … IdP がメタデータで世界に配っている
 *   ・IdP の X.509 証明書 … **公開鍵**。秘密鍵ではない
 * したがって `AGENTS.md §3.7`（秘密を残さない）に抵触せず、GUI から設定できる
 * （`knowledge/decisions/auth-methods.md`「設定はユーザーがする」）。
 * 🚨 **SP 側の秘密鍵は v1 では持たない。** 持つときが来たら環境変数に置く（DB には入れない）。
 *
 * ── IdP ごとに行を分けない ──
 * `auth-methods.md`「Entra ID / Google Workspace / Okta は同じ SAML」。
 * 設定は**単一行**（`ohmycms_settings` と同じ形）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_saml_config", (table) => {
    // ohmycms_settings と同じ「単一行」の形。CHECK 制約で 1 行に縛る。
    table.integer("id").primary().defaultTo(1);

    // 🚨 既定は無効。設定が空のまま SSO の入口を出さないため。
    table.boolean("enabled").notNullable().defaultTo(false);

    // ── IdP 側（利用者が GUI で入れる。すべて公開情報）──
    table.text("idp_entity_id");
    table.text("idp_sso_url");
    /** IdP の署名検証用 X.509 証明書（PEM もしくは base64 本体）。複数世代を持てるよう配列で保存する。 */
    table.jsonb("idp_certificates");

    // ── SP 側（既定はリクエストから組み立てる。上書きしたいときだけ入る）──
    table.text("sp_entity_id");

    // ── 属性マッピング（利用者が設定する。🚨 NameID をメールに固定しないための要）──
    table.text("attribute_email");
    table.text("attribute_first_name");
    table.text("attribute_last_name");
    table.text("attribute_groups");

    table.timestamp("updated_at");
    table.uuid("updated_by");
  });

  await knex.raw(
    "ALTER TABLE ohmycms_saml_config ADD CONSTRAINT ohmycms_saml_config_single_row CHECK (id = 1)",
  );

  /**
   * 使用済み Assertion の台帳（リプレイ防止）。
   *
   * 🚨 受入基準「同じ応答を2回使えない」はここでしか満たせない。
   *    署名検証は**正しい応答なら何度でも通る**ので、検証だけでは防げない。
   *    主キー衝突で弾く（アプリ側の「先に SELECT して無ければ INSERT」は並行時に素通りする。
   *    `lib/schema/errors.ts` に同じ理由の記述がある）。
   */
  await knex.schema.createTable("ohmycms_saml_assertions", (table) => {
    /** Assertion の ID（IdP が発行する。SAML 仕様上ユニーク）。 */
    table.text("assertion_id").primary();
    table.timestamp("consumed_at").notNullable().defaultTo(knex.fn.now());
    /** この時刻を過ぎたら掃除してよい（Assertion の NotOnOrAfter）。 */
    table.timestamp("expires_at").notNullable();
    table.index(["expires_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_saml_assertions");
  await knex.schema.dropTableIfExists("ohmycms_saml_config");
}
