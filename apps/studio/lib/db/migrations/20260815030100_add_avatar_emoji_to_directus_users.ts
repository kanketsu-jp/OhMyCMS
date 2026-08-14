import type { Knex } from "knex";

// 利用者が選んだアバター絵文字。SSO の画像が無いときのみ使う（優先順位: SSO画像 → 本列 → 既定の絵文字）。
// 🚨 長さは 1〜4 にしない。絵文字は肌の色・ZWJ 合成で複数コードポイントになる
// （例: 👩‍💻 は3つ、🧑🏽‍🚀 は4つ以上）ので、32 で採る。
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_users", (table) => {
    table.string("avatar_emoji", 32);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_users", (table) => {
    table.dropColumn("avatar_emoji");
  });
}
