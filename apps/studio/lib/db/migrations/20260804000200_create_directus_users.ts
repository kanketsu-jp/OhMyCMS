import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_users", (table) => {
    table.uuid("id").primary();
    table.string("first_name", 50);
    table.string("last_name", 50);
    table.string("email", 128).notNullable().unique();
    table.string("password", 255);
    table.string("status", 16).notNullable().defaultTo("active");
    table.uuid("role").references("id").inTable("directus_roles");
    table.string("token", 255).unique();
    table.timestamp("last_access");
    table.string("provider", 128).notNullable().defaultTo("default");
    table.string("external_identifier", 255).unique();
    table.json("auth_data");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_users");
}
