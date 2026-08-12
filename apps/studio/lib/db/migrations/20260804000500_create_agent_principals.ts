import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("agent_principals", (table) => {
    table.uuid("id").primary();
    table.string("name", 255).notNullable();
    table
      .uuid("on_behalf_of")
      .notNullable()
      .references("id")
      .inTable("directus_users")
      .onDelete("CASCADE");
    table.json("tenant_scope");
    table.json("capabilities");
    table.string("token_hash", 255).notNullable().unique();
    table.string("origin", 255);
    table.timestamp("expires_at").notNullable();
    table.timestamp("revoked_at");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("agent_principals");
}
