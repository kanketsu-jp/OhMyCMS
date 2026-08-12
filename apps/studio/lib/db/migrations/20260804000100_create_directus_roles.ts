import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_roles", (table) => {
    table.uuid("id").primary();
    table.string("name", 100).notNullable();
    table.text("description");
    table.uuid("parent");
  });

  await knex.schema.alterTable("directus_roles", (table) => {
    table.foreign("parent").references("id").inTable("directus_roles");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_roles");
}
