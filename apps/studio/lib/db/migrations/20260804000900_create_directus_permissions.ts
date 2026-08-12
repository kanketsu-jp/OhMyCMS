import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_permissions", (table) => {
    table.increments("id").primary();
    table
      .uuid("policy")
      .notNullable()
      .references("id")
      .inTable("directus_policies")
      .onDelete("CASCADE");
    table.string("collection").notNullable();
    table.string("action").notNullable();
    table.json("permissions");
    table.json("validation");
    table.json("presets");
    table.text("fields");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_permissions");
}
