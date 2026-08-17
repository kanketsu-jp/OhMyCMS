import type { Knex } from "knex";

/**
 * コレクションごとのアイコン（堀池さん 2026-08-17・K2）。
 *
 * 🚨 **既存の列は 1 つも変えない。既存の行も触らない。** 既定は `null`＝「選んでいない」で、
 *    画面側は `DEFAULT_COLLECTION_ICON`（= `table`）へ落とす。
 *    ＝ **この列を足しても、いまの見た目は 1 ミリも変わらない**（サイドバーは既に table を出している）。
 *
 * 🚨 **長さ 64 の理由。** 入るのは lucide の**アイコン名**（`shield-alert` / `folder-tree` 等）で、
 *    絵文字ではない。合成絵文字のような複数コードポイントの心配は無い
 *    （`directus_users.avatar_emoji` が varchar(32) なのは絵文字だから。**同じ理由ではない**）。
 *    許可リストは `lib/admin/collection-icons.ts` にあり、いちばん長い名前でも 12 文字。
 *    64 にしてあるのは、名前が長い絵を後から足せるようにするため。
 *
 * 🚨 **Directus に合わせた名前**（`packages/types/src/collection.ts:16` が `icon: string | null`）。
 *    こちらだけ `icon_name` のような別名にすると、真似る先と読み替えが要る。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_collections", (table) => {
    table.string("icon", 64);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_collections", (table) => {
    table.dropColumn("icon");
  });
}
