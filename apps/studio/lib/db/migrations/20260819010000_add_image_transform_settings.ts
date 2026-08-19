import type { Knex } from "knex";

/** 画像変換の安全上限。既定値は service.ts に持ち、ここでは DB の上書き欄だけを足す。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.string("image_input_max_dimension", 16);
    table.string("image_output_max_dimension", 16);
    table.string("image_max_operations", 16);
    table.string("image_max_concurrency", 16);
    table.string("image_transform_timeout_ms", 16);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.dropColumn("image_input_max_dimension");
    table.dropColumn("image_output_max_dimension");
    table.dropColumn("image_max_operations");
    table.dropColumn("image_max_concurrency");
    table.dropColumn("image_transform_timeout_ms");
  });
}
