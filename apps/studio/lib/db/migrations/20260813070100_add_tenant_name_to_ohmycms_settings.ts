import type { Knex } from "knex";

/**
 * テナント名（組織名）。
 *
 * 🚨 テナント機能の設計より先に器（テーブル）を決めると、機能を設計したときに形が合わず
 *    移行が要る。文字列1つなら、どんな形に決まっても移せる。入力は受け取るが、器は決めない。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.string("tenant_name", 255);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.dropColumn("tenant_name");
  });
}
