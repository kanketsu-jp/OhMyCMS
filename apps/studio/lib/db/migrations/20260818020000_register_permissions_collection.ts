import type { Knex } from "knex";

// directus_activity.collection の外部キーを満たし、権限行の完全削除を監査できるようにする。
// hidden=true なので、管理画面の利用者コレクション一覧には出さない。
export async function up(knex: Knex): Promise<void> {
  await knex("directus_collections").insert({
    collection: "directus_permissions",
    note: "権限設定",
    hidden: true,
    singleton: false,
    archive_app_filter: true,
    collapse: "open",
    status: "active",
  }).onConflict("collection").ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex("directus_collections").where({ collection: "directus_permissions" }).delete();
}
