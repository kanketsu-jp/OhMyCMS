import type { Knex } from "knex";

// 欄名（フィールドの表示名）をロケールごとに持つための列。
//
// なぜ DB なのか: このCMSは利用者が実行時にコレクションとフィールドを作る。
// 静的な辞書（`i18n/messages/<locale>/<namespace>.json`）は**ビルド時に確定するもの**なので、
// 実行時に増える欄の名前は置けない。AGENTS.md §3.8 が守りたいのは
// 「**全文言が自前の辞書にある**」ことなので、**実行時に増える文言は DB 側の辞書**に置く。
//
// 🚨 いま画面に出ているのは**生の識別子**（`body_rich` / `created_at`）。
//    実測（2026-08-16）: `field.field` をそのまま描いている箇所が 22 行。
//    利用者が作った欄ほど、画面に機械的な名前が出る。
//
// 形: `{"ja": "本文", "en": "Body"}` の JSON。ロケールをキーにする。
//   - **列を `label_ja` / `label_en` と分けない。** 言語を足すたびに migration が要る形になり、
//     `i18n/messages/<locale>/` を足すだけで増える静的側と、増え方が食い違う。
//   - Directus も `directus_fields.translations` を持つ（互換性のために名前を合わせた）。
//
// 🚨 **nullable。既定は null。**
//    既に在るコレクション・フィールドは 1 行も書き換えない（＝表示は今までどおり
//    生の識別子のまま）。**この migration だけでは画面は 1 文字も変わらない。**
//    表示側の読み替えは別の変更で入れる（入れるまでは、列が在るだけの状態）。
//    NOT NULL や既定値を入れると、既存行に意味の無い値が入って
//    「利用者が名前を付けた」と「まだ付けていない」の区別が付かなくなる。
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_fields", (table) => {
    table.jsonb("translations").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_fields", (table) => {
    table.dropColumn("translations");
  });
}
