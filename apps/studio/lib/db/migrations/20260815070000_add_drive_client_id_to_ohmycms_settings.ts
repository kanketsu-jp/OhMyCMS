import type { Knex } from "knex";

/**
 * Google ドライブへ繋ぐための `client_id`。
 *
 * 🚨 **これは秘密ではない。** ドライブの OAuth は **PKCE だけで組んであり、
 *    クライアントの秘密鍵を持たない**（`lib/drive/oauth.ts`）。`client_id` は
 *    認可 URL に載って利用者のブラウザにも出るので、隠す意味がない。
 *    → **`secret-box` を通さない普通の列**にする。暗号化する列と混ぜない。
 *
 * 🚨 **なぜ環境変数でなく設定（DB）か**: セルフホストする人が**GUI で入れられる**方がよい
 *    （環境変数は「起動に必要なもの」だけにする、という方針）。値が秘密でないので、
 *    GUI で扱っても漏れる経路が増えない。**秘密なら逆の判断になる**（そちらは secret-box）。
 *
 * 空のときは「ドライブ連携が設定されていない」を意味する。**繋ぐ導線を出さない**こと。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.string("drive_client_id", 255);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.dropColumn("drive_client_id");
  });
}
