import type { Knex } from "knex";

// 仕組みの表に、ソフトデリートの印を足す（設問283 / 288 A・2026-08-16）。
//
// ご指示は「全ての削除はソフトデリートにし、ゴミ箱を新設する」。
// 利用者が作った表は名前が実行時にしか分からないので別の手（実行時に「無ければ足す」）で足すが、
// 🚨 **仕組みの表は名前が分かっている**ので、ここで足せる。
//
// 対象を 4 つにしたのは、待っている作業がこの 4 つに乗っているため:
//   directus_files / directus_folders … ファイルの実体を 90 日保つ（storage）
//   ohmycms_labels / ohmycms_label_assignments … 割り当てを消さずに隠す（toast）
//
// 🚨 **null 可・既定なし**。「消えていない」を null で表すので、**既存行の意味が変わらない**。
// 🚨 **読む側はまだ誰も見ない**。この migration では**振る舞いが 1 つも変わらない**。
//    ＝ **これだけでは「削除が soft になった」ことにはならない**
//      （`deleteFile` を soft にするのは storage、割り当てを隠すのは toast）。
//
// 入れる前に控えた行数（2026-08-16・schema と toast が別々に採って一致）:
//   directus_files 23 / directus_folders 1 / ohmycms_labels 3 / ohmycms_label_assignments 0
//   🚨 あとから測ると「23 行が生きている」しか言えず、
//      元が 30 行で 7 行消えた場合と区別が付かないので、先に控えてある。
const TABLES = [
  "directus_files",
  "directus_folders",
  "ohmycms_labels",
  "ohmycms_label_assignments",
] as const;

export async function up(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.schema.alterTable(table, (t) => {
      t.timestamp("deleted_at", { useTz: true }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.schema.alterTable(table, (t) => {
      t.dropColumn("deleted_at");
    });
  }
}
