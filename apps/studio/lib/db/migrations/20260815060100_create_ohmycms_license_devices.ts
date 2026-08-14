import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_license_devices", (table) => {
    table.text("license_id").notNullable().references("id").inTable("ohmycms_licenses").onDelete("CASCADE");
    table.text("device_id").notNullable();
    table.timestamp("activated_at", { useTz: true }).notNullable();
    table.timestamp("last_seen_at", { useTz: true }).notNullable();
    table.primary(["license_id", "device_id"]);
    table.index(["license_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_license_devices");
}
