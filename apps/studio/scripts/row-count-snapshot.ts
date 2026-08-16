/**
 * 共有 DB の**行数**を写し取り、あとで突き合わせる（2026-08-16・設問288 A）。
 *
 * 🚨 **なぜ要るか。** `down` の確認は使い捨ての DB へ移した
 * （`verify-migrations-roundtrip.sh`）。ただし **使い捨てで down が通ること ≠
 * 共有で up が正しく効いたこと**——使い捨ての結果は、**共有 DB の状態を 1 バイトも見ていない**。
 * だから共有 DB へ `up` したあとは、**行数が前後で同じ**を別途測る。
 *
 * 使い方:
 *   bun scripts/row-count-snapshot.ts --save /path/before.json   # migrate の**前**
 *   bun run migrate
 *   bun scripts/row-count-snapshot.ts --compare /path/before.json
 *
 * 落ちる条件:
 *   - 🚨 **既に在った表の行数が変わった**（migration が行を触った）
 *   - 🚨 **表が消えた**
 * 落ちない（報告だけ）:
 *   - 表が増えた。🚨 ただし**増えた表に行が入っていたら印を付けて出す**
 *     （空の表を足すのと、行ごと持ってくるのは別の話なので）
 *
 * 終了コード: 0 = 同じ / 1 = 変わった / 2 = 前提が整っていない（＝**何も測れていない**）
 */
import fs from "node:fs";
import { db } from "../lib/db/knex";

type Snapshot = { at: string; counts: Record<string, number> };

async function 数える(): Promise<Record<string, number>> {
  const rows = await db("information_schema.tables")
    .where({ table_schema: "public", table_type: "BASE TABLE" })
    .select("table_name");
  const out: Record<string, number> = {};
  for (const r of rows as Array<{ table_name: string }>) {
    const one = await db(r.table_name).count({ c: "*" }).first();
    out[r.table_name] = Number((one as { c: string | number }).c);
  }
  return out;
}

// 🚨 対照。**表が少なすぎる／合計 0 行**なら、この検査は「同じでした」しか言えない。
//    「変わらなかった 0」と「そもそも何も見ていない 0」が、同じ見た目になるため。
function 測れているか(counts: Record<string, number>): string | null {
  const 表数 = Object.keys(counts).length;
  const 合計 = Object.values(counts).reduce((a, b) => a + b, 0);
  if (表数 < 5) return `表が ${表数} 個しかありません（＝ DB を掴めていない疑い）`;
  if (合計 === 0) return `全 ${表数} 表の合計が 0 行です（＝ 空の DB を見ている疑い）`;
  return null;
}

const mode = process.argv[2];
const file = process.argv[3];
if ((mode !== "--save" && mode !== "--compare") || !file) {
  console.error("使い方: bun scripts/row-count-snapshot.ts --save|--compare <path>");
  process.exit(2);
}

const いま = await 数える();
const 問題 = 測れているか(いま);
if (問題) {
  console.error(`🚨 ${問題}`);
  console.error("   ＝ **この検査は何も測っていません**。0 件と全件が同じ見た目になります。");
  await db.destroy();
  process.exit(2);
}

if (mode === "--save") {
  const snap: Snapshot = { at: new Date().toISOString(), counts: いま };
  fs.writeFileSync(file, JSON.stringify(snap, null, 2));
  const 合計 = Object.values(いま).reduce((a, b) => a + b, 0);
  console.log(`✅ 写しました: 表 ${Object.keys(いま).length} 個 / 合計 ${合計} 行 → ${file}`);
  await db.destroy();
  process.exit(0);
}

const 前: Snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
const 前表 = Object.keys(前.counts);

// 🚨 **写した側にも同じ対照を当てる**（2026-08-16・自分で作って踏んだ）。
//    これが無いと、**空の写しと突き合わせて「0 表を突き合わせ ✅」で exit 0** になる。
//    ＝ **空の期待は、「全部ある」系の検査を必ず通す。**
//    実測: `{"counts":{}}` を食わせたら緑になった。いまは exit 2 で止まる。
const 前の問題 = 測れているか(前.counts);
if (前の問題) {
  console.error(`🚨 写した側が測れていません: ${前の問題}`);
  console.error("   ＝ **突き合わせる相手が空です**。「同じでした」ではありません。");
  await db.destroy();
  process.exit(2);
}
console.log(`  前（${前.at}）: 表 ${前表.length} 個 / 合計 ${Object.values(前.counts).reduce((a, b) => a + b, 0)} 行`);
console.log(`  後          : 表 ${Object.keys(いま).length} 個 / 合計 ${Object.values(いま).reduce((a, b) => a + b, 0)} 行`);

const 変わった: string[] = [];
const 消えた: string[] = [];
const 増えた: string[] = [];
for (const [t, n] of Object.entries(前.counts)) {
  if (!(t in いま)) { 消えた.push(`${t}（${n} 行あった）`); continue; }
  if (いま[t] !== n) 変わった.push(`${t}: ${n} → ${いま[t]}`);
}
for (const [t, n] of Object.entries(いま)) {
  if (!(t in 前.counts)) 増えた.push(n === 0 ? `${t}（空）` : `🚨 ${t}（${n} 行入っている）`);
}

if (増えた.length > 0) {
  console.log(`  増えた表 ${増えた.length} 個:`);
  for (const s of 増えた) console.log(`    ${s}`);
}
if (変わった.length === 0 && 消えた.length === 0) {
  console.log(`✅ 既に在った表の行数は、前後で全部同じです（${前表.length} 表を突き合わせ）`);
  await db.destroy();
  process.exit(0);
}
if (消えた.length > 0) {
  console.log(`🚨 消えた表 ${消えた.length} 個:`);
  for (const s of 消えた) console.log(`    ${s}`);
}
if (変わった.length > 0) {
  console.log(`🚨 行数が変わった表 ${変わった.length} 個:`);
  for (const s of 変わった) console.log(`    ${s}`);
}
await db.destroy();
process.exit(1);
