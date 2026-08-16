import type { Knex } from "knex";

// コレクションの表示名をロケードごとに持つための列（設問318 の推奨案 A・2026-08-16）。
//
// 🚨 **なぜ要るか。** 実測（2026-08-16）で、この CMS には
// **「コレクションの表示名」を置く場所が 1 つも無い**:
//   `directus_collections` の 16 列に `name` / `label` / `title` / `translations` は無し。
//   `display_template` は Directus では**1 行をどう表示するか**の雛形で、別物（値も 0/15）。
//   作成画面の入力欄は **2 つだけ**で、識別子は `pattern="[A-Za-z_][A-Za-z0-9_]*"`
//   ＝ 🚨 **日本語のコレクション名を入れる場所が、どこにも無い**。
//   その結果、ゴミ箱は `note`（ラベルは「**メモ**」）を表示名として使っており、
//   利用者が説明のつもりで書いた文が見出しになる。
//
// 🚨 **フィールドには既に `translations` が在る**（`directus_fields.translations`・設問286 A）。
// **欄には名前を付けられるのに、コレクションには付けられない**——その不揃いを消す。
//
// 🚨 **nullable。既定は null。** 既存の 15 行は 1 行も書き換えない
// （＝ **この migration だけでは画面は 1 文字も変わらない**。表名がそのまま出る）。
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_collections", (table) => {
    table.jsonb("translations").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_collections", (table) => {
    table.dropColumn("translations");
  });
}
