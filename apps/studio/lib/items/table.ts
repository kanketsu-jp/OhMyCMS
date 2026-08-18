import type { Knex } from "knex";
import { db } from "@/lib/db/knex";
import { DELETED_AT_COLUMN, INTERNAL_COLUMNS } from "@/lib/schema/service";

// 利用者の表を開く**入口**（設問288 A）。
// 🚨 **`lib/items/` の中から利用者の表を開くときは、必ずここを通す。**
//    `service.ts` に置いていたが、**一覧を組み立てる `query.ts` から import できず
//    （service.ts が query.ts を import しているので循環する）、
//    一覧だけが素通りしていた**（2026-08-16 実測・design が画面側で先に気づいた）。
//    → **両方から import できる場所へ出す**。置き場所そのものが原因だった。

// 🚨 **2 つに分ける**。「もう確かめた」と「列が在る」は別。
//    登録が無い表・主キーが無い表は**確かめ済みだが列は無い**ので、
//    1 つの集合にすると**列が無い表にも条件を足してしまい、必ず落ちる**。
const 確認済み = new Set<string>();
const 列が在る = new Set<string>();

export async function ensureDeletedAtColumn(
  conn: Knex | Knex.Transaction,
  collection: string,
): Promise<void> {
  if (確認済み.has(collection)) return;

  const 登録 = await conn("directus_collections").where({ collection }).first();
  if (!登録) {
    // 🚨 登録が無い表は対象外。**覚えない**（後から同名で作られる可能性がある）。
    return;
  }

  const 主キー = await conn.raw<{ rows: { c: string }[] }>(
    `select kcu.column_name as c
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      where tc.table_schema = 'public' and tc.table_name = ? and tc.constraint_type = 'PRIMARY KEY'
      limit 1`,
    [collection],
  );
  if (主キー.rows.length === 0) {
    // 🚨 **対象外にしたことをログに出す**（司令塔の条件）。黙って飛ばさない。
    console.warn(
      `[softdelete] ${collection} は主キーが無いので deleted_at を足しません`
      + `（戻すときに行を特定できないため。ボード 307 待ち）`,
    );
    確認済み.add(collection);
    return;
  }

  try {
    await conn.raw(`ALTER TABLE ?? ADD COLUMN IF NOT EXISTS ?? timestamptz`, [
      collection,
      DELETED_AT_COLUMN,
    ]);
    // 🚨 **`directus_fields` にも行を入れる**（2026-08-16・286 A ② で見つけた副作用）。
    //    列だけ足すと、**フィールド一覧に `deleted_at` が「利用者の作った列」として並ぶ**。
    //    利用者から見れば **消してよさそうな列**に見えるが、消すとゴミ箱が壊れる。
    //
    // 🚨 **名前で除外しない**（`field === "deleted_at"` を画面側に書かない）。
    //    それをやると **判定の道が 2 本**になり（`meta.hidden` と 名前）、
    //    次に内部列を足す人がどちらに従うか分からなくなる。
    //    **印は `hidden` 1 本**に揃える——`body_rich_plain` が既にそうしている。
    // 🚨 **正本（`INTERNAL_COLUMNS`）を回す。列名を直に書かない**（toast の指摘・2026-08-16）。
    //    以前はここに `DELETED_AT_COLUMN` と書いていた。**集合が 1 個のうちは同じ結果**だが、
    //    2 個目を足した日に **断る側は自動で断り、登録側は登録しない**——
    //    ＝ **hidden も readonly も付かない列が画面に出る**。**増えた瞬間に穴が空く形**だった。
    // 🚨 実際に在る列だけ登録する（集合に在っても、その表に列が無いことはある）。
    const 実在 = await conn("information_schema.columns")
      .where({ table_schema: "public", table_name: collection })
      .whereIn("column_name", [...INTERNAL_COLUMNS])
      .pluck<string[]>("column_name");
    if (実在.length > 0) {
      await conn("directus_fields")
        .insert(実在.map((field) => ({
          collection,
          field,
          interface: "datetime",
          hidden: true,
          readonly: true,
          note: "この CMS が自動で足した項目です。消すとゴミ箱からの復元が動かなくなります",
        })))
        .onConflict(["collection", "field"])
        .ignore();
    }
    確認済み.add(collection);
    列が在る.add(collection);
  } catch (error) {
    // 🚨 **覚えない**。次に開いたときにもう一度試す。
    console.error(
      `[softdelete] ${collection} に deleted_at を足せませんでした`
      + `（次に開いたときに再試行します）: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function itemsTable(
  conn: Knex | Knex.Transaction,
  collection: string,
): Knex.QueryBuilder {
  // 🚨 **列が在る表だけ**に条件を足す（設問288 A・2026-08-16）。
  //    列は「その表を初めて開いたとき」に付くので、**半分の表にだけ付いた状態が正常**。
  //    列が無い表で `whereNull` を足すと、**その表の問い合わせが必ず落ちます**。
  //    ＝ **在るかどうかで分ける**のが、この配り方の必然です。
  //
  // 🚨 **この注記は 2026-08-16 に反転した。** 以前はここに
  //    「`deleted_at` を非 null にするコードは 1 つも無いので、振る舞いは変わらない」と
  //    書いてあったが、**いまは変わる**——`deleteItem`（items）と `deleteFile` / `deleteFolder`
  //    （storage）が論理削除になったので、**消した行はここで実際に隠れる**。
  //    🚨 古い注記を残すと、読んだ人が「まだ効いていない」と誤解する。
  if (列が在る.has(collection)) return conn(collection).whereNull(DELETED_AT_COLUMN);
  return conn(collection);
}

/**
 * その表に `deleted_at` 列が付いているか（＝ 論理削除できるか）。
 * 🚨 **集合そのものを外へ出さない**（外から書き換えられると、
 *    「列が在る」という記憶と実体がずれても誰も気づけない）。
 */
export function hasDeletedAtColumn(collection: string): boolean {
  return 列が在る.has(collection);
}
