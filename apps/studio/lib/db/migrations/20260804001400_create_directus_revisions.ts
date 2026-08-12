import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_revisions", (table) => {
    table.increments("id").primary();
    table
      .integer("activity")
      .notNullable()
      .references("id")
      .inTable("directus_activity")
      .onDelete("CASCADE");
    table
      .string("collection")
      .notNullable()
      .references("collection")
      .inTable("directus_collections")
      .onDelete("CASCADE");
    table.string("item", 255).notNullable();
    table.json("data");
    table.json("delta");
    table.integer("parent");
  });

  await knex.schema.alterTable("directus_revisions", (table) => {
    table.foreign("parent").references("id").inTable("directus_revisions");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_revisions");
}
