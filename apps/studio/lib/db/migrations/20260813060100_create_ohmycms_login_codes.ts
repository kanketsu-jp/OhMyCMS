import type { Knex } from "knex";

/**
 * メールアドレスへの確認コード(OTP)ログイン用テーブル。
 * ohmycms_ 接頭辞なので items API から自動的に守られる(lib/schema/validate.ts の isSystemTableName)。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_login_codes", (table) => {
    table.uuid("id").primary();
    table.string("email", 128).notNullable();
    table.text("code_hash").notNullable();
    table.timestamp("expires_at").notNullable();
    table.integer("attempts").notNullable().defaultTo(0);
    table.timestamp("consumed_at");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["email", "expires_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_login_codes");
}
