import type { Knex } from "knex";

/**
 * 公開 URL で配信できるかをファイルごとに持つ。
 *
 * 🚨 既存ファイルは非公開のままにする。先に false を埋めてから既定値を
 * true にすることで、これから作る行だけが既定で公開になる。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_files", (table) => {
    table.boolean("is_public").notNullable().defaultTo(false);
  });

  await knex("directus_files").update({ is_public: false });

  await knex.schema.alterTable("directus_files", (table) => {
    table.boolean("is_public").notNullable().defaultTo(true).alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_files", (table) => {
    table.dropColumn("is_public");
  });
}
