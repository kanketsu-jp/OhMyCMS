import type { Knex } from "knex";

/**
 * 不具合報告に添える画像。
 *
 * directus_files へ混ぜると、ファイル機能の権限を緩めた瞬間に報告画像も緩む。
 * そのため、報告専用の表と配信口を持つ。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_bug_report_attachments", (table) => {
    table.uuid("id").primary();
    table
      .uuid("report_id")
      .notNullable()
      .references("id")
      .inTable("ohmycms_bug_reports")
      .onDelete("CASCADE");
    table.text("storage_key").notNullable();
    table.text("filename").notNullable();
    table.text("content_type").notNullable();
    table.integer("size").notNullable();
    table
      .uuid("uploaded_by")
      .references("id")
      .inTable("directus_users")
      .onDelete("SET NULL");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(
      ["report_id", "created_at"],
      "ohmycms_bug_report_attachments_report_idx",
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_bug_report_attachments");
}
