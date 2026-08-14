import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_license_revocations", (table) => {
    table.text("type").notNullable();
    table.text("id").notNullable();
    table.timestamp("revoked_at", { useTz: true }).notNullable();
    table.text("reason");
    table.primary(["type", "id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_license_revocations");
}
