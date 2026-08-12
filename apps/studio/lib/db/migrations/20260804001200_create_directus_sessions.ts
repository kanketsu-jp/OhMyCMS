import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_sessions", (table) => {
    table.string("token", 64).primary();
    table
      .uuid("user")
      .notNullable()
      .references("id")
      .inTable("directus_users")
      .onDelete("CASCADE");
    table.timestamp("expires").notNullable();
    table.string("ip", 255);
    table.string("user_agent", 255);
    table.json("data");
    table.string("origin");
    table.string("next_token", 64);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_sessions");
}
