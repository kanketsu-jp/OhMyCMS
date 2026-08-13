import type { Knex } from "knex";

/**
 * アプリ内通知（F2 §2-F）。**自分宛のものだけ**を一覧・既読にできる最小構成。
 *
 * `recipient` に索引を張っているのは、一覧が必ず
 * 「自分宛のものに絞る」クエリになるため（権限の絞り込みを WHERE で必ず通す）。
 * 🚨 一覧を「全件取ってからアプリで絞る」実装にしないこと。
 *    AGENTS.md §3.5「権限はフィルタで隠すのでなく、サーバ側で拒否する」と同じ考え方で、
 *    他人宛の行は**そもそも SELECT しない**。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_notifications", (table) => {
    table.uuid("id").primary();
    table
      .uuid("recipient")
      .notNullable()
      .references("id")
      .inTable("directus_users")
      .onDelete("CASCADE");
    // 文言は辞書キーで持つ（UI に文字列を直接書かないのと同じ理由で、
    // 通知も言語に依らない形で保存する）。表示側が i18n で引く。
    table.string("message_key", 128).notNullable();
    // 辞書の差し込み値（{name} など）。言語非依存の値だけを入れる。
    table.jsonb("message_params");
    // 通知元へ飛ぶためのリンク。アプリ内の相対パスのみ。
    table.string("link", 512);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("read_at");

    table.index(["recipient", "read_at"], "ohmycms_notifications_recipient_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_notifications");
}
