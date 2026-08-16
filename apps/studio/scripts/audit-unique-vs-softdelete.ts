/**
 * 一意制約と論理削除の噛み合わせを棚卸しする（2026-08-16・設問290 A の周辺）。
 *
 * 🚨 **何が問題か。** 行を論理削除しても、一意制約は**消えた行の値を押さえたまま**になる。
 * ＝ **ゴミ箱の中の名前が使えない**（「削除したのに、同じ名前で作れない」）。
 * さらに悪いのは逆で、**先に名前を空けてしまうと、復元のときに衝突して戻せなくなる**。
 * → 正しい形は **部分索引**（`... WHERE deleted_at IS NULL`）。
 *   生きている行だけで一意にすれば、**消した名前は空き、復元は衝突しない**。
 *
 * 使い方: `bun scripts/audit-unique-vs-softdelete.ts`
 * 終了コード: 0 = 手当ての要るものは無い / 1 = 在る / 2 = 前提が整っていない（何も測れていない）
 *
 * 🚨 **この検査が見ていないもの（毎回ここを読むこと）**:
 *   - **アプリ側で名前の重複を弾いている**箇所（SQL の制約でなく TypeScript の検査）は見えない
 *   - **複数列の一意**は列名を並べて出すだけで、どの列が利用者に見える名前かは判定しない
 *   - **これは DB の今の状態**を見る。コードを読んでいないので、**未適用の migration は入らない**
 */
import { db } from "../lib/db/knex";

const システム4 = new Set([
  "directus_files", "directus_folders", "ohmycms_labels", "ohmycms_label_assignments",
]);

const rows = await db.raw(`
  select t.relname as table_name, i.relname as index_name, ix.indisprimary as is_primary,
         pg_get_expr(ix.indpred, ix.indrelid) as predicate, pg_get_indexdef(ix.indexrelid) as def
  from pg_index ix
  join pg_class i on i.oid = ix.indexrelid
  join pg_class t on t.oid = ix.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where ix.indisunique and n.nspname = 'public' and t.relkind = 'r'
  order by t.relname, i.relname
`);
type Row = { table_name: string; index_name: string; is_primary: boolean; predicate: string | null; def: string };
const 全索引: Row[] = rows.rows;

const 全表 = (await db("information_schema.tables")
  .where({ table_schema: "public", table_type: "BASE TABLE" }).select("table_name"))
  .map((r: { table_name: string }) => r.table_name).sort();

// 🚨 前提が整っているか。**表が数個しか見えないなら「手当て 0 件」は言えない**
//    （「無い」と「見ていない」が同じ見た目になる）。
if (全表.length < 5 || 全索引.length === 0) {
  console.error(`🚨 表 ${全表.length} 個 / 一意索引 ${全索引.length} 本しか見えません＝ この検査は何も測っていません`);
  await db.destroy();
  process.exit(2);
}

const 登録 = new Set((await db("directus_collections").select("collection"))
  .map((r: { collection: string }) => r.collection));
const 主キー有り = new Set((await db("information_schema.table_constraints")
  .where({ table_schema: "public", constraint_type: "PRIMARY KEY" }).select("table_name"))
  .map((r: { table_name: string }) => r.table_name));
const 列有り = new Set((await db("information_schema.columns")
  .where({ table_schema: "public", column_name: "deleted_at" }).select("table_name"))
  .map((r: { table_name: string }) => r.table_name));

// 🚨 「対象か」を **いま `deleted_at` 列が在るか**で決めない。
//    列は「その表を初めて開いたとき」に付くので、**日々増える数**になる
//    （同じ検査を明日走らせると答えが変わる）。**これから対象になる表**まで含める。
const 対象か = (t: string) => システム4.has(t) || (登録.has(t) && 主キー有り.has(t));

const 非PK = 全索引.filter((r) => !r.is_primary);
const 列名 = (def: string) => def.replace(/^.*USING \w+ \(/, "(").replace(/\).*$/, ")");

const 手当てが要る: string[] = [];
const 対策済: string[] = [];
const 対象外: string[] = [];
for (const r of 非PK) {
  const 行 = `${r.table_name}.${r.index_name} ${列名(r.def)}`;
  if (!対象か(r.table_name)) 対象外.push(行);
  else if ((r.predicate ?? "").includes("deleted_at")) 対策済.push(`${行}  WHERE ${r.predicate}`);
  else 手当てが要る.push(行 + (列有り.has(r.table_name) ? "" : "（まだ列は無い＝一度も開かれていない）"));
}

console.log(`■ 範囲: public の実体のある表 ${全表.length} 個（ビュー・外部表は含まない）`);
console.log(`■ 一意索引 ${全索引.length} 本 ＝ 主キー ${全索引.length - 非PK.length} 本 ＋ 主キー以外 ${非PK.length} 本`);
console.log(`   🚨 数えているのは**索引**。制約は裏で索引を作るので、これで制約も入る`);
console.log(`\n■ 🚨 手当てが要る（論理削除の対象なのに、消えた行の値を押さえたまま）= ${手当てが要る.length} 本`);
for (const s of 手当てが要る) console.log(`    🚨 ${s}`);
console.log(`■ 🟢 既に deleted_at を見ている（部分索引）= ${対策済.length} 本`);
for (const s of 対策済) console.log(`    ${s}`);
console.log(`■ 論理削除の対象でない表 = ${対象外.length} 本`);
for (const s of 対象外) console.log(`    ${s}`);
console.log(`\n■ 照合: ${手当てが要る.length} + ${対策済.length} + ${対象外.length} = `
  + `${手当てが要る.length + 対策済.length + 対象外.length}`
  + `（主キー以外 ${非PK.length} と一致: ${手当てが要る.length + 対策済.length + 対象外.length === 非PK.length}）`);

// 🟢 対照。**「一意索引が 1 本も無い表」も出せること**を毎回見せる。
//    これが 0 だと、「全部に在る」のか「そもそも表を見ていない」のか区別が付かない。
const 索引有り = new Set(全索引.map((r) => r.table_name));
const 零 = 全表.filter((t) => !索引有り.has(t));
console.log(`■ 🟢 対照: 一意索引が 1 本も無い表 = ${零.length} 個 ${零.slice(0, 5).join(", ")}${零.length > 5 ? " …" : ""}`);

await db.destroy();
process.exit(手当てが要る.length > 0 ? 1 : 0);
