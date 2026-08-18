import type { Knex } from "knex";

/** AuthnRequest の短時間レート制限に使う送信元識別子。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_saml_requests", (table) => {
    table.text("source");
    table.index(["source", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_saml_requests", (table) => {
    table.dropIndex(["source", "created_at"]);
    table.dropColumn("source");
  });
}
