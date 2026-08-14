import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.text("s3_endpoint");
    table.text("s3_bucket");
    table.text("s3_region");
    table.text("s3_access_key_id");
    table.text("s3_secret_access_key");
    table.text("s3_force_path_style");
    table.text("s3_key_prefix");
    table.text("google_client_id");
    table.text("google_client_secret");
    table.text("smtp_host");
    table.text("smtp_port");
    table.text("smtp_user");
    table.text("smtp_password");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.dropColumn("s3_endpoint");
    table.dropColumn("s3_bucket");
    table.dropColumn("s3_region");
    table.dropColumn("s3_access_key_id");
    table.dropColumn("s3_secret_access_key");
    table.dropColumn("s3_force_path_style");
    table.dropColumn("s3_key_prefix");
    table.dropColumn("google_client_id");
    table.dropColumn("google_client_secret");
    table.dropColumn("smtp_host");
    table.dropColumn("smtp_port");
    table.dropColumn("smtp_user");
    table.dropColumn("smtp_password");
  });
}
