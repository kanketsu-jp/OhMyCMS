/**
 * 一意制約と論理削除の噛み合わせを棚卸しする（2026-08-16・設問290 A の周辺）。
 *
 * 🚨 **何を見る道具か。** 行を論理削除しても、一意制約は**消えた行の値を押さえたまま**になる。
 * これは 2 通りに転べる:
 *   (a) **押さえたままにする** … 「消したのに同じ名前で作れない」。ただし **戻すことは必ずできる**
 *   (b) **部分索引にして空ける**（`... WHERE deleted_at IS NULL`）… 名前は空くが、
 *       🚨 **その名前で新しい行が作られると、ゴミ箱から戻せなくなる**
 *
 * 🚨 **この CMS の裁定は (a)**（2026-08-16・司令塔）。**「戻せる」を保証するには、
 * 名前を押さえ続けるしかない**——ゴミ箱の約束（戻すと全部戻る）のほうが先だから。
 * 見えない不便にならないよう、**ラベルは `LABEL_EXISTS_TRASHED` を別のエラーに分け、
 * 「戻すか、完全に削除してください」と伝えている**（toast の実装）。
 *
 * 🚨 **だからこの道具は「部分索引になっていないものを直させる」ためのものではない。**
 * **「まだ誰も決めていない一意制約」を見つける**ためのもの。
 * 決めたものは下の `裁定済み` に理由つきで書き、**新しく増えたものだけが赤くなる**。
 *
 * 使い方: `bun scripts/audit-unique-vs-softdelete.ts`
 * 終了コード: 0 = **未決が無い** / 1 = **未決が在る**（＝ 誰かが決める必要がある） /
 *             2 = 前提が整っていない（＝ 何も測れていない）
 *
 * 🚨 **この検査が見ていないもの（毎回ここを読むこと）**:
 *   - **アプリ側で名前の重複を弾いている**箇所（SQL の制約でなく TypeScript の検査）は見えない
 *   - **複数列の一意**は列名を並べて出すだけで、どの列が利用者に見える名前かは判定しない
 *   - **これは DB の今の状態**を見る。コードを読んでいないので、**未適用の migration は入らない**
 */
import { db } from "../lib/db/knex";

// 🚨 **決めたもの**は、ここに理由つきで置く。**放っておくと、裁定を知らない人が逆向きに直す。**
//    キーは `表.索引名`。
const 裁定済み: Record<string, string> = {
  "ohmycms_labels.ohmycms_labels_name_unique":
    "(a) 押さえたまま。戻せることを優先（司令塔 2026-08-16）。LABEL_EXISTS_TRASHED で理由を伝える",
  "ohmycms_labels.ohmycms_labels_system_key_unique":
    "(a) 押さえたまま。同上（system_key は仕組み側の鍵なので、なおさら空けない）",
};

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

const 未決: string[] = [];
const 決めてある: string[] = [];
const 対策済: string[] = [];
const 対象外: string[] = [];
for (const r of 非PK) {
  const 行 = `${r.table_name}.${r.index_name} ${列名(r.def)}`;
  if (!対象か(r.table_name)) 対象外.push(行);
  else if ((r.predicate ?? "").includes("deleted_at")) 対策済.push(`${行}  WHERE ${r.predicate}`);
  else if (裁定済み[`${r.table_name}.${r.index_name}`]) 決めてある.push(`${行}\n        ${裁定済み[`${r.table_name}.${r.index_name}`]}`);
  else 未決.push(行 + (列有り.has(r.table_name) ? "" : "（まだ列は無い＝一度も開かれていない）"));
}

console.log(`■ 範囲: public の実体のある表 ${全表.length} 個（ビュー・外部表は含まない）`);
console.log(`■ 一意索引 ${全索引.length} 本 ＝ 主キー ${全索引.length - 非PK.length} 本 ＋ 主キー以外 ${非PK.length} 本`);
console.log(`   🚨 数えているのは**索引**。制約は裏で索引を作るので、これで制約も入る`);
console.log(`\n■ 🚨 **まだ誰も決めていない**（論理削除の対象なのに、扱いが決まっていない）= ${未決.length} 本`);
for (const s of 未決) console.log(`    🚨 ${s}`);
console.log(`■ ✅ 決めてある（押さえたまま＝意図した形。直さないこと）= ${決めてある.length} 本`);
for (const s of 決めてある) console.log(`    ✅ ${s}`);
console.log(`■ 🟢 部分索引にしてある（＝ 名前を空ける側に決めたもの）= ${対策済.length} 本`);
for (const s of 対策済) console.log(`    ${s}`);
console.log(`■ 論理削除の対象でない表 = ${対象外.length} 本`);
for (const s of 対象外) console.log(`    ${s}`);
const 合計 = 未決.length + 決めてある.length + 対策済.length + 対象外.length;
console.log(`\n■ 照合: ${未決.length} + ${決めてある.length} + ${対策済.length} + ${対象外.length} = ${合計}`
  + `（主キー以外 ${非PK.length} と一致: ${合計 === 非PK.length}）`);

// 🟢 対照。**「一意索引が 1 本も無い表」も出せること**を毎回見せる。
//    これが 0 だと、「全部に在る」のか「そもそも表を見ていない」のか区別が付かない。
const 索引有り = new Set(全索引.map((r) => r.table_name));
const 零 = 全表.filter((t) => !索引有り.has(t));
console.log(`■ 🟢 対照: 一意索引が 1 本も無い表 = ${零.length} 個 ${零.slice(0, 5).join(", ")}${零.length > 5 ? " …" : ""}`);

await db.destroy();
// 🚨 赤くするのは**未決のときだけ**。決めてあるものは、何本あっても緑。
//    ＝ **新しく増えた一意制約に気づくため**の道具であって、
//      **既に決めた形を直させるため**の道具ではない。
process.exit(未決.length > 0 ? 1 : 0);
