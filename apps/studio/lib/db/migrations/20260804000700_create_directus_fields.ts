import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_fields", (table) => {
    table.increments("id").primary();
    table
      .string("collection")
      .notNullable()
      .references("collection")
      .inTable("directus_collections")
      .onDelete("CASCADE");
    table.string("field").notNullable();
    table.string("special");
    table.string("interface");
    table.json("options");
    table.string("display");
    table.json("display_options");
    table.boolean("locked").notNullable().defaultTo(false);
    table.boolean("readonly").notNullable().defaultTo(false);
    table.boolean("hidden").notNullable().defaultTo(false);
    table.boolean("required").notNullable().defaultTo(false);
    table.integer("sort");
    table.string("width").notNullable().defaultTo("full");
    table.integer("group");
    table.text("note");
    table.json("conditions");
    table.json("validation");
    table.text("validation_message");

    table.unique(["collection", "field"]);
  });

  await knex.schema.alterTable("directus_fields", (table) => {
    table.foreign("group").references("id").inTable("directus_fields");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_fields");
}
