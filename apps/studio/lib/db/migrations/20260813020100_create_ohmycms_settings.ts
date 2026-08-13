import type { Knex } from "knex";

/**
 * 全体設定（F2 §2-A）。**単一行**のテーブル。
 *
 * 設計の要: **環境変数は「初期値」、この行が「正」。**
 *   - 行が無い状態でも起動できる（受入基準 #2「環境変数だけで設定が完結する」を壊さない）
 *   - 行が無い間は環境変数と既定値で動く
 *   - GUI で保存すると行ができ、以後は環境変数を変えてもこちらが勝つ
 * → したがって**マイグレーションで初期行を入れない**。入れてしまうと
 *   「環境変数を変えたのに反映されない」が初回から起きる。
 *
 * id を固定値にしているのは、単一行であることを DB 側でも保証するため
 * （CHECK 制約で id = 1 に縛る）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_settings", (table) => {
    table.integer("id").primary();
    table.string("project_name", 255);
    table
      .uuid("project_logo")
      .references("id")
      .inTable("directus_files")
      .onDelete("SET NULL");
    table.string("project_color", 32);
    table.string("default_locale", 16);
    table.text("public_note");
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table
      .uuid("updated_by")
      .references("id")
      .inTable("directus_users")
      .onDelete("SET NULL");
  });

  // 単一行であることを DB 側で保証する（アプリのバグで2行目が入らないように）。
  await knex.raw(
    "ALTER TABLE ohmycms_settings ADD CONSTRAINT ohmycms_settings_single_row CHECK (id = 1)",
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_settings");
}
