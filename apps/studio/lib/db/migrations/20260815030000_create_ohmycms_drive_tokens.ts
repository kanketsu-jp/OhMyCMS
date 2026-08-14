import type { Knex } from "knex";

/**
 * Google ドライブから取り込むための、**利用者ごとの**リフレッシュトークン。
 *
 * 🚨 なぜ `ohmycms_settings` に置かないか:
 *   settings は **1 行しかない**テーブル（`id = 1` の CHECK 制約付き）で、
 *   「このアプリの設定」を持つ場所。**ドライブのトークンは利用者ごとに違う**ので置けない。
 *   クライアント ID / シークレット（アプリに 1 組）は settings、
 *   利用者のトークンはこのテーブル、と**持ち主で分ける**。
 *
 * 🚨 `refresh_token` は **必ず `lib/settings/secret-box.ts` を通して暗号化**した文字列を入れる
 *   （AES-256-GCM・`OHMYCMS_SECRET_KEY`）。平文を入れない。新しい暗号化を発明しない。
 *   `OHMYCMS_SECRET_KEY` が無いときは secret-box が保存を拒む（既存の挙動をそのまま使う）。
 *
 * 🚨 アクセストークンは**保存しない**。短命（1時間）で、リフレッシュトークンから作り直せる。
 *   置き場所が増えるほど漏れる経路が増えるので、**保存しないで済むものは保存しない**。
 *
 * 利用者 1 人につき 1 つ（主キーが user_id）。複数の Google アカウントを紐づけたくなったら
 * そのときに主キーを変える。**今要らない柔軟さを先に作らない。**
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_drive_tokens", (table) => {
    table
      .uuid("user_id")
      .primary()
      .references("id")
      .inTable("directus_users")
      // 🚨 利用者を消したらトークンも消える。残すと、消えた人の資格情報が DB に残り続ける。
      .onDelete("CASCADE");
    // secret-box が返す "v1:iv:tag:ciphertext" の形。平文ではない。
    table.text("refresh_token").notNullable();
    // 同意した範囲。後から必要な範囲が増えたとき、再同意が要るかを判定するために持つ。
    table.string("scope", 255).notNullable();
    // 取り込み先の Google アカウント（表示用）。🚨 これは秘密ではない。
    table.string("account_email", 255);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_drive_tokens");
}
