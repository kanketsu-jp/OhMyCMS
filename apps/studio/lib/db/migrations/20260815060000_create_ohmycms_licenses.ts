import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_licenses", (table) => {
    table.text("id").primary();
    table.text("plan").notNullable();
    table.integer("device_limit").notNullable();
    table.jsonb("entitlements").notNullable().defaultTo("[]");
    table.text("key_id").notNullable();
    table.timestamp("issued_at", { useTz: true }).notNullable();
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.text("note");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_licenses");
}
