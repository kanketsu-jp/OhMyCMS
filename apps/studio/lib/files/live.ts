import { db } from "@/lib/db/knex";

/**
 * **「生きている行だけを見る」判定を、1 箇所に置く。**
 *
 * 削除は「消す」ではなく「印を立てる」に変わった（283 A・2026-08-16）。
 * そのため `db("directus_files")` を素で書くと、**ゴミ箱に入れたものが画面や API に出る**。
 *
 * 🚨 **なぜ `lib/files/service.ts` の中ではなく、別のファイルなのか。**
 *    `lib/labels/service.ts` も同じ判定を要る（ラベルの認可が、消えたファイルを
 *    「在る」と見ていた。toast が実測で見つけた）。しかし
 *    **`files → labels` の import が既に在る**ので（`authorizeTarget`）、
 *    `labels → files` を足すと**循環 import** になる。
 *    → **どちらでもない第 3 の場所**に置き、両方がここを読む。
 *
 * 🚨 **判定を 2 箇所に書かないこと。** 片方だけ直すと、
 *    「一覧からは消えたのに、ラベルは付け替えられる」のような食い違いが出る。
 *
 * 🚨 **90 日の掃除だけは、消えた行を見る必要がある。**
 *    そこは素の `db(...)` を使い、**その場に理由を書くこと**。
 */

/** ゴミ箱の対象になる表。**ここに無い表を渡せない**（打ち間違いを型で止める）。 */
export type SoftDeletableTable = "directus_files" | "directus_folders";

/**
 * 生きている行だけの問い合わせ。**型は呼ぶ側が決める**。
 *
 * 🚨 生の行の型（`FileRow` など）を**この場所へ持ってこない**。
 *    持ってくると、その型を export することになり、**外へ漏れる経路が増える**
 *    （`check-raw-row-exports` が見張っているのは、まさにその形）。
 */
export function liveRows<T extends object>(table: SoftDeletableTable) {
  return db<T>(table).whereNull("deleted_at");
}

/**
 * その id の行が **生きているか**。ゴミ箱に在る／そもそも無い、はどちらも false。
 *
 * 🚨 **権限は見ていない**。「在るか」だけを答える。
 *    権限の判定は呼ぶ側（`resolvePermission` / 行フィルタ）の仕事で、
 *    ここに混ぜると**2 つの別の問いが 1 つの関数に入る**。
 */
export async function isLiveRow(table: SoftDeletableTable, id: string): Promise<boolean> {
  const row = await liveRows<{ id: string }>(table).where({ id }).first("id");
  return Boolean(row);
}
