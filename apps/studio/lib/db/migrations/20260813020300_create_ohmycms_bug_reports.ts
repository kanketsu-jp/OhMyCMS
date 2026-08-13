import type { Knex } from "knex";

/**
 * 不具合の報告（F2 §2-G）。**DB 保存が本体**で、メール送信はおまけ。
 *
 * 🚨 保存する項目を意図的に絞っている。
 *   仕様「報告本文に秘密が混ざりうるので、環境変数の値やトークンを自動で添付しない」より、
 *   **自動収集するのは利用者が見て分かるものだけ**にする:
 *     - 報告者（ログイン中のユーザー）
 *     - 報告時に開いていた画面のパス
 *     - User-Agent
 *   環境変数・Cookie・トークン・リクエストヘッダ全体は**保存しない**。
 *   デバッグに要る情報は、利用者が本文へ自分で書く。
 *
 * `mail_status` は「送ったつもりで送れていない」を残さないための欄。
 * 未設定でスキップしたのか、送ろうとして失敗したのかを区別できるようにする。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_bug_reports", (table) => {
    table.uuid("id").primary();
    table
      .uuid("reporter")
      .references("id")
      .inTable("directus_users")
      .onDelete("SET NULL");
    table.string("title", 255).notNullable();
    table.text("body").notNullable();
    // 報告時に開いていた画面（アプリ内の相対パスのみ）。
    table.string("page_path", 512);
    table.string("user_agent", 512);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    // skipped(宛先未設定) / sent / failed。送信の可否は本体の成否に影響させない。
    table.string("mail_status", 16).notNullable().defaultTo("skipped");
    // 失敗理由。🚨 SMTP のパスワードなどが混ざらないよう、呼び出し側で伏せてから入れる。
    table.string("mail_error", 512);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_bug_reports");
}
