import type { Knex } from "knex";

/**
 * 不具合報告の**やりとり**（チャットの 2 通目以降）。
 *
 * 由来（堀池・2026-08-15）:
 * > 「不具合報告はチャット形式にする。**初回はフォームっぽくしていい。それ以降は**
 * >   返信があったらお知らせに表示される。」
 *
 * ── なぜ「1 通目」をこの表に入れないか ──
 *
 * 1 通目の内容は `ohmycms_bug_reports` の `title` / `body` / `expected` にある。
 * それをこの表にも複製すると、**同じ文が 2 箇所に載る**。
 * 直すとき片方が腐るので、複製しない。
 * → 画面は「報告そのもの（1 通目）＋ この表の行」を続けて描く。
 *
 * 🚨 だから **`report` に対して 0 行でも正常**。「0 行 ＝ まだ返信が無い」であって、
 *    「報告が壊れている」ではない。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_bug_report_messages", (table) => {
    table.uuid("id").primary();
    table
      .uuid("report")
      .notNullable()
      .references("id")
      .inTable("ohmycms_bug_reports")
      // 報告を消したらやりとりも消える（残しても行き先が無い）。
      .onDelete("CASCADE");
    // 🚨 退会しても**発言は残す**（経緯が読めなくなるため）。名前は表示側で補う。
    table
      .uuid("author")
      .references("id")
      .inTable("directus_users")
      .onDelete("SET NULL");
    table.text("body").notNullable();
    /**
     * message = 人が書いた発言 / resolved・reopened = 状態が変わったという記録。
     *
     * 🚨 状態の変化を**別表にしない**のは、チャットとして時系列に混ぜて出すため
     *    （「解決にしました」がやりとりの間に挟まって見えるのが自然）。
     * 🚨 `resolved` / `reopened` の行では `body` は空文字でよい。
     *    文言は表示側が辞書から引く（**DB に日本語を入れない**）。
     */
    table.string("kind", 16).notNullable().defaultTo("message");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    // 1 つの報告のやりとりを古い順に読む、が唯一の読み方。
    table.index(["report", "created_at"], "ohmycms_bug_report_messages_report_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_bug_report_messages");
}
