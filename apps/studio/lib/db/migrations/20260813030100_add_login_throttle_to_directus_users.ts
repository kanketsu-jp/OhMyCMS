import type { Knex } from "knex";

// メール/パスワード認証の失敗回数と一時ロック期限をユーザー行で共有するための列。
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_users", (table) => {
    table.integer("failed_login_attempts").notNullable().defaultTo(0);
    table.timestamp("locked_until");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_users", (table) => {
    table.dropColumn("failed_login_attempts");
    table.dropColumn("locked_until");
  });
}
