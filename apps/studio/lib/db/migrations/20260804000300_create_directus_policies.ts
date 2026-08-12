import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_policies", (table) => {
    table.uuid("id").primary();
    table.string("name", 100).notNullable();
    table.text("description");
    table.text("ip_access");
    table.boolean("app_access").notNullable().defaultTo(true);
    table.boolean("admin_access").notNullable().defaultTo(false);
    table.boolean("enforce_tfa").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_policies");
}
