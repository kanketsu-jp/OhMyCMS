import type { Knex } from "knex";

// 90 日の掃除が「走ったこと」を記録する表（設問300 の束・2026-08-16）。
//
// 🚨 **なぜ表が要るか。** 掃除は cron から**黙って**走る。
//    記録が無いと **「まだ 1 度も走っていない」と「走って 0 件だった」が同じ顔**になる
//    （司令塔の条件）。**0 件の 4 つの顔のうち、4 つ目（まだ出番が来ていない）を分けるため。**
//
// 🚨 **消した件数だけでなく、対象にした表と除外した表も残す。**
//    あとから「なぜこの表は掃除されていないのか」を、実行時の記録から答えられるようにする
//    （**コードを読み直しても、その日の除外リストは分からない**）。
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_trash_purge_runs", (table) => {
    table.increments("id").primary();
    table.timestamp("started_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("finished_at", { useTz: true }).nullable();
    // 🚨 消した件数の合計。**0 でも行は残す**（＝「走って 0 件」の証拠）
    table.integer("deleted_total").notNullable().defaultTo(0);
    // 対象にした表と、表ごとの件数 `{"zz_a": 3}`
    table.jsonb("deleted_by_table").nullable();
    // 🚨 除外した表と理由 `{"directus_activity": "監査は消さない"}`
    table.jsonb("skipped").nullable();
    // 🚨 失敗したときの理由（**落ちたことも記録に残す**。黙って消えない）
    table.text("error").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("ohmycms_trash_purge_runs");
}
