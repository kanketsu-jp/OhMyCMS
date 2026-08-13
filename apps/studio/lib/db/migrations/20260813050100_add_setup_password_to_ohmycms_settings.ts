import type { Knex } from "knex";

/**
 * メールを使わないローカルログイン用のセットアップパスワード。
 * scrypt のハッシュ文字列だけを保存し、画面や API レスポンスには出さない。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.text("setup_password");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.dropColumn("setup_password");
  });
}
