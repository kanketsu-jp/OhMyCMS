import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_access", (table) => {
    table.uuid("id").primary();
    table
      .uuid("role")
      .references("id")
      .inTable("directus_roles")
      .onDelete("CASCADE");
    table
      .uuid("user")
      .references("id")
      .inTable("directus_users")
      .onDelete("CASCADE");
    table
      .uuid("policy")
      .notNullable()
      .references("id")
      .inTable("directus_policies")
      .onDelete("CASCADE");
    table.integer("sort");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_access");
}
