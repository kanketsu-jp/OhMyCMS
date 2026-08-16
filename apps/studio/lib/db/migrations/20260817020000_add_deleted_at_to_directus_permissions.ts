import type { Knex } from "knex";

// 権限（`directus_permissions`）にも論理削除の列を足す（設問300・2026-08-16）。
//
// 🚨 **なぜ permissions だけか。** 堀池さんの備考がそのまま理由:
//    「**そもそも権限は誰か紐づいていたら消せない**」（`decisions/trash-and-restore-ui.md` の設問300）
//    ＝ **`directus_policies` / `directus_access` は「消えない」側**なので、列を足さない。
//    🚨 **消えないものに列を足すと、使われない列が増える**（あとで意味を忘れる）。
//
// 🚨 **auth の実測（紐づいていれば 409）は「裏づけ」であって、判断の根拠ではない。**
//    409 の条件が変われば実装依存の理由は崩れるが、堀池さんの決定は動かない。
//
// 🚨 **policies / access を外したことを、ここに書いておく。**
//    書かないと、次の人が「漏れている」と思って足しに来る（実際、私も
//    「3 表とも `deleted_at` を持っていない」と見つけて、足すべきか迷った）。
//
// 【測った・2026-08-16】
//   - `20260816040000_add_deleted_at_to_system_tables.ts` が触る表は **4 つ**
//     （files / folders / labels / label_assignments）＝ **permissions は入っていない**
//   - `lib/trash/service.ts` が扱う表も **7 つ**で、permissions は無い
//   - DB … `directus_permissions` は実在し、`deleted_at` を持つ列は **0 個**
//     🟢 対照 `directus_permissions` の行数 **1**（＝ **空の表ではない**。
//        行が 0 なら、掃除を書いても何も起きない）
//
// 🚨 **nullable。既定は null。** 既存行は 1 行も書き換えない
// （＝ この migration だけでは、画面も API も 1 文字も変わらない）。
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_permissions", (table) => {
    table.timestamp("deleted_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_permissions", (table) => {
    table.dropColumn("deleted_at");
  });
}
