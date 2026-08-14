import type { Knex } from "knex";

/**
 * 不具合の報告を**チャット**にするための列を足す。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「不具合報告は**チャット形式**にする。初回はフォームっぽくしていい。
 * >   それ以降は返信があったらお知らせに表示される。」
 * > 「**報告一覧では未解決のチャットルームが並ぶ**。ページ最初（上部）には
 * >   『未解決』『解決済み』のタブ。」
 * > 「報告する時は、そのページのパスなどがメタ情報として入る。**5W1H を担保する**。
 * >   報告自体は入力しやすいように、**自動で取得できる情報以外**の内容などを入れさせる。」
 *
 * ── 5W1H をどう埋めるか（**人に入力させるのは 3 つだけ**）──
 *
 * | | 何で埋めるか | 誰が |
 * |---|---|---|
 * | Who   | `reporter` | 自動 |
 * | When  | `created_at` | 自動 |
 * | Where | `page_path` ＋ `viewport` ＋ `user_agent` ＋ `locale` ＋ `app_version` | 自動 |
 * | What  | `title` ＋ `body` | 人 |
 * | Why   | `expected`（本来どうなるはずだったか） | 人 |
 * | How   | `body`（何をしたらそうなったか） | 人 |
 *
 * 🚨 **When に「利用者側の時計」を別に持たない。** `created_at`（サーバ時刻）で足りる。
 *    報告は不具合に出会ったその場で書く導線なので、2 つ持つと**ずれた 2 つの時刻**が残るだけ。
 *
 * 🚨 **自動で集めるものを増やしていない。**
 *    元の設計（20260813020300）の「**秘密を自動で集めない**」を引き継ぐ。
 *    足した `viewport` / `locale` / `app_version` は、いずれも
 *    **利用者が見て分かる・秘密ではない**もので、再現に直接効く
 *    （どの画面幅か・どの言語か・どのバージョンか）。
 *    環境変数・Cookie・トークン・リクエストヘッダ全体は**今も保存しない**。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_bug_reports", (table) => {
    // open / resolved。🚨 既存行は既定値で open に入る（＝一覧に出る）。
    // 「見えなくなる」より「未解決として出てくる」ほうが安全side なのでこの向き。
    table.string("status", 16).notNullable().defaultTo("open");
    table.timestamp("resolved_at");
    table
      .uuid("resolved_by")
      .references("id")
      .inTable("directus_users")
      .onDelete("SET NULL");

    // チャットルームの並び順に使う。**返信が来た順**に上へ出したい。
    // 🚨 既存行は NULL になるので、読む側は `last_message_at ?? created_at` で扱う。
    //    ここを `defaultTo(now)` にすると、**昔の報告が全部いま返信されたことになる**。
    table.timestamp("last_message_at");

    // ── 自動で入れる再現用の情報（秘密ではないものだけ）──
    table.string("viewport", 32);
    table.string("locale", 16);
    table.string("app_version", 64);

    // ── 人が入れる（Why）──
    table.text("expected");

    // 一覧は必ず「未解決 / 解決済み」で絞るので、その形に索引を張る。
    table.index(["status", "last_message_at"], "ohmycms_bug_reports_status_idx");
    // 「自分の報告だけ」を出す一覧のため。
    table.index(["reporter", "status"], "ohmycms_bug_reports_reporter_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_bug_reports", (table) => {
    table.dropIndex(["status", "last_message_at"], "ohmycms_bug_reports_status_idx");
    table.dropIndex(["reporter", "status"], "ohmycms_bug_reports_reporter_idx");
    table.dropColumn("status");
    table.dropColumn("resolved_at");
    table.dropColumn("resolved_by");
    table.dropColumn("last_message_at");
    table.dropColumn("viewport");
    table.dropColumn("locale");
    table.dropColumn("app_version");
    table.dropColumn("expected");
  });
}
