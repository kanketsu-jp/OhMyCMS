import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_folders", (table) => {
    table.uuid("id").primary();
    table.string("name", 255).notNullable();
    table.uuid("parent");
  });

  await knex.schema.alterTable("directus_folders", (table) => {
    table.foreign("parent").references("id").inTable("directus_folders");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_folders");
}
