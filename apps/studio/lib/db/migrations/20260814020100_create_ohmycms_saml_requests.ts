import type { Knex } from "knex";

/**
 * 送り出した AuthnRequest の台帳（`InResponseTo` の照合用）。
 *
 * 🚨 **なぜ DB に持つか。** `@node-saml/node-saml` の既定の `cacheProvider` は
 *    **プロセス内のメモリ**で、
 *      ・再起動で消える（利用者がログイン中に配り直すと全員弾かれる）
 *      ・コンテナを複数立てると**送った側と受ける側が別プロセス**になり、必ず照合に失敗する
 *    ため使えない。DB に置けばどちらも起きない。
 *
 * 🚨 **これはリプレイ防止ではない。** リプレイ防止は `ohmycms_saml_assertions`（Assertion ID）側。
 *    ここが守るのは「**こちらが出した要求への応答か**」で、目的が違う。両方要る。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_saml_requests", (table) => {
    /** AuthnRequest の ID。IdP は応答の `InResponseTo` にこれを入れて返す。 */
    table.text("request_id").primary();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    /** この時刻を過ぎたら照合しない（＝掃除してよい）。 */
    table.timestamp("expires_at").notNullable();
    table.index(["expires_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_saml_requests");
}
