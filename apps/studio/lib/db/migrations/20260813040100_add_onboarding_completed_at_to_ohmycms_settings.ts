import type { Knex } from "knex";

/**
 * オンボーディング（初回ログイン時に1回だけ出る画面）が終わったかどうか。
 *
 * **真偽値でなく時刻**にしてあるのは、「いつ終わったか」が後から効くため
 * （いつからこの設定で動いているのか、を追える）。**null なら未完了**。
 *
 * 置き場所を `ohmycms_settings`（単一行）にしたのは、オンボーディングで決める
 * 項目（プロジェクト名・ロゴ・言語）がすべてこの行にあるから。テーブルを増やさない。
 *
 * 🚨 この列は `WRITABLE_KEYS` に入れない。設定 API の PATCH から書けてしまうと、
 *    オンボーディングを何度でも出し直せる（あるいは出なくできる）状態になる。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.timestamp("onboarding_completed_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.dropColumn("onboarding_completed_at");
  });
}
