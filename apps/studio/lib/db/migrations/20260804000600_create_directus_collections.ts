import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_collections", (table) => {
    table.string("collection").primary().notNullable();
    table.text("note");
    table.string("display_template");
    table.boolean("hidden").notNullable().defaultTo(false);
    table.boolean("singleton").notNullable().defaultTo(false);
    table.string("archive_field");
    table.boolean("archive_app_filter").notNullable().defaultTo(true);
    table.string("archive_value");
    table.string("unarchive_value");
    table.string("sort_field");
    table.string("accountability");
    table.json("item_duplication_fields");
    table.string("group");
    table.string("collapse").notNullable().defaultTo("open");
    table.string("status").notNullable().defaultTo("active");
    table.float("autosave_revision_interval");
  });

  await knex.schema.alterTable("directus_collections", (table) => {
    table
      .foreign("group")
      .references("collection")
      .inTable("directus_collections");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_collections");
}
