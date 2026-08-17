import type { Knex } from "knex";

/**
 * 利用者ごとの任意設定を保存する入れ物。
 * キーを列として固定せず、後から設定項目を増やせるようにする。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_user_preferences", (table) => {
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("directus_users")
      .onDelete("CASCADE");
    table.string("key", 128).notNullable();
    table.jsonb("value").notNullable();
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table.primary(["user_id", "key"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_user_preferences");
}
