import type { Knex } from "knex";

// そのセッションがどの経路で作られたかを記録する列。
// SSO専用(sso_only)へ切り替えた時点でパスワード経由のセッションだけを切りたいが、
// いまは経路を示す列が無い（`origin` は要求元URLであって認証方式ではない）。
// 🚨 nullable にする。既に在るセッションは経路が分からないので null のまま残す
//    （NOT NULL にすると、いま入っている利用者ぶんの行が無効になり migration が落ちる＝全員ログアウト）。
// 🚨 この migration では「切る」処理は書かない。記録だけを先に始める（設計の承認待ち）。
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_sessions", (table) => {
    table.string("auth_method", 32).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_sessions", (table) => {
    table.dropColumn("auth_method");
  });
}
