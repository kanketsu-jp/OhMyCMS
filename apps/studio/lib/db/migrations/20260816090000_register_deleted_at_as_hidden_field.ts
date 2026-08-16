import type { Knex } from "knex";

// 実行時に足した `deleted_at` 列を、`directus_fields` に**隠し項目として登録する**
// （2026-08-16・286 A ② の途中で見つけた副作用）。
//
// 🚨 **何が起きていたか。** ゴミ箱（設問288 A）のために `deleted_at` 列を実行時 DDL で足したが、
// `directus_fields` には行を入れていなかった。画面は「表の列」を読むので、
// **利用者が作った列と区別が付かないまま 3 画面に出ていた**（2026-08-16 実測）:
//   フィールド一覧 / レコード一覧の見出し / 🚨 **編集フォーム（＝ 入力できてしまう）**
//
// 🚨 **名前で除外しない。** `field === "deleted_at"` を画面側に書くと、
// 判定の道が 2 本（`meta.hidden` と 名前）になり、次に内部列を足す人が迷う。
// **印は `hidden` 1 本に揃える**——`body_rich_plain`（本文の検索用）が既にそうしている。
// 実測: `meta.hidden` を見ている画面は 3 つ（content/page.tsx・panel-display.tsx・item-form.tsx）。
//
// 🚨 **この migration は「今ある分」だけを埋める。** これから足りる分は
// `lib/items/table.ts` の `ensureDeletedAtColumn` が列と同時に入れる。
// 片方だけだと、**列を足した表と登録した表がずれていく**。
export async function up(knex: Knex): Promise<void> {
  // 列が在り、かつ directus_collections に登録がある表だけ。
  // 🚨 `on conflict do nothing` … 既に行が在る表を二重に入れない（何度流しても同じ）。
  await knex.raw(`
    insert into directus_fields (collection, field, interface, hidden, readonly, note)
    select c.table_name, 'deleted_at', 'datetime', true, true,
           '削除した日時（自動）。ゴミ箱から戻すときに使います'
      from information_schema.columns c
      join directus_collections dc on dc.collection = c.table_name
     where c.table_schema = 'public' and c.column_name = 'deleted_at'
    on conflict (collection, field) do nothing
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 🚨 **利用者が触れない行なので消してよい**（`hidden` かつ `readonly` で入れたものだけ）。
  //    ただし `hidden`/`readonly` を人が変えていたら、それは意図が変わったということなので残す。
  await knex("directus_fields")
    .where({ field: "deleted_at", hidden: true, readonly: true })
    .delete();
}
