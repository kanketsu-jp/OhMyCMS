import type { Knex } from "knex";

/**
 * 更新確認先の URL。
 *
 * 由来: 堀池さん「**環境変数は最小にする。基本全て GUI、MCP、CLI で設定する。**」（2026-08-15）
 *
 * 🚨 これは「起動時に確定していなくてよい設定」なので GUI 側へ移せる。判定の条件はひとつ:
 *    **要求のたびに DB から読めるか**。`checkForUpdate()` は `/api/version` の
 *    リクエストの中で呼ばれるので、読める（実測: 呼び出しは 1 箇所だけ）。
 *
 * 🚨 移せないものと混ぜないこと。`OHMYCMS_PUBLIC_URL` と `STORAGE_LOCAL_ROOT` は
 *    **「変えさせないため」env に残す**と決まっている（保管先を動かすと既存ファイルが迷子になる等）。
 *
 * 環境変数 `OHMYCMS_UPDATE_FEED_URL` は**初期値として残る**（DB → env の順で読む）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.string("update_feed_url", 512);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.dropColumn("update_feed_url");
  });
}
