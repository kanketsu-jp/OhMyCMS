import type { Knex } from "knex";

/** 公開 URL の状態と、URL だけを作り直すための別トークン。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_files", (table) => {
    table.string("visibility", 16).notNullable().defaultTo("public");
    table.uuid("public_token");
  });

  await knex("directus_files").where({ is_public: false }).update({ visibility: "private" });
  await knex("directus_files").where({ is_public: true }).update({ visibility: "public" });
  await knex("directus_files").whereNull("public_token").update({ public_token: knex.raw("gen_random_uuid()") });

  await knex.schema.alterTable("directus_files", (table) => {
    table.uuid("public_token").notNullable().alter();
    table.index(["public_token"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_files", (table) => {
    table.dropIndex(["public_token"]);
    table.dropColumn("public_token");
    table.dropColumn("visibility");
  });
}
