import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_activity", (table) => {
    table.increments("id").primary();
    table.string("action", 45).notNullable();
    table
      .uuid("user")
      .references("id")
      .inTable("directus_users")
      .onDelete("SET NULL");
    table.timestamp("timestamp").notNullable().defaultTo(knex.fn.now());
    table.string("ip", 50).notNullable();
    table.string("user_agent", 255);
    table
      .string("collection")
      .notNullable()
      .references("collection")
      .inTable("directus_collections")
      .onDelete("CASCADE");
    table.string("item", 255).notNullable();
    table.text("comment");
    table.string("actor_type", 16).notNullable().defaultTo("human");
    table.uuid("actor_id");
    table
      .uuid("on_behalf_of")
      .references("id")
      .inTable("directus_users")
      .onDelete("SET NULL");
    table.string("via_tool", 128);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_activity");
}
