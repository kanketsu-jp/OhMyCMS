import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_relations", (table) => {
    table.increments("id").primary();
    table
      .string("many_collection")
      .notNullable()
      .references("collection")
      .inTable("directus_collections")
      .onDelete("CASCADE");
    table.string("many_field").notNullable();
    table.string("many_primary").notNullable();
    table
      .string("one_collection")
      .references("collection")
      .inTable("directus_collections")
      .onDelete("CASCADE");
    table.string("one_field");
    table.string("one_primary");
    table.string("one_collection_field");
    table.text("one_allowed_collections");
    table.string("junction_field");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_relations");
}
