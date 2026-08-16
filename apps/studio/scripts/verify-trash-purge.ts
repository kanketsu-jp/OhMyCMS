/**
 * 90 日の掃除の受入（設問300 の束・2026-08-16）。
 * 🚨 **使い捨ての postgres でしか走らせない**（共有 DB のポートを渡すと止まる）。
 * 終了コード: 0 = 全部通った / 1 = 期待と違う / 2 = 前提が整っていない
 */
import knex from "knex";
import { purgeTrash, runPurge, 掃除しない表 } from "../lib/trash/purge";
import { TRASH_RETENTION_DAYS } from "../lib/trash/service";

const url = process.env.PROBE_DATABASE_URL;
if (!url) { console.error("🚨 PROBE_DATABASE_URL が要ります（使い捨ての DB）"); process.exit(2); }
if (/5436/.test(url)) { console.error("🚨 共有 DB のポートです。使い捨てでしか走らせません"); process.exit(2); }
const db = knex({ client: "pg", connection: url, pool: { min: 0, max: 5 } });

let ok = 0, ng = 0;
const t = (name: string, 実際: unknown, 期待: unknown) => {
  const p = JSON.stringify(実際) === JSON.stringify(期待);
  p ? ok++ : ng++;
  console.log(`  ${p ? "✅" : "🚨"} ${name}  実際=${JSON.stringify(実際)} 期待=${JSON.stringify(期待)}`);
};

const 日 = 24 * 60 * 60 * 1000;
const いま = new Date("2026-08-16T12:00:00Z");
const 古い = new Date(いま.getTime() - (TRASH_RETENTION_DAYS + 5) * 日);
const 新しい = new Date(いま.getTime() - 3 * 日);

// 🚨 「まだ 1 度も走っていない」を先に測る（走らせる前）
const 走行前 = Number((await db("ohmycms_trash_purge_runs").count({ c: "*" }).first())!.c as string);
t("🚨 まだ 1 度も走っていない（記録 0 件）", 走行前, 0);

// 使い捨ての表を 2 つ作る（1 つは「あとから足した表」＝ (ii) の証明）
await db.raw(`create table zz_purge_a (id uuid primary key, deleted_at timestamptz)`);
await db.raw(`create table zz_purge_later (id uuid primary key, deleted_at timestamptz)`);
const ID = {
  古い: "aaaa0000-0000-4000-8000-000000000001",
  新しい: "bbbb0000-0000-4000-8000-000000000002",
  生きて: "cccc0000-0000-4000-8000-000000000003",
  後から: "dddd0000-0000-4000-8000-000000000004",
};
await db("zz_purge_a").insert([
  { id: ID.古い, deleted_at: 古い },
  { id: ID.新しい, deleted_at: 新しい },
  { id: ID.生きて, deleted_at: null },
]);
await db("zz_purge_later").insert([{ id: ID.後から, deleted_at: 古い }]);

// 🚨 除外リストは **いまは空**。空でも「除外が効くこと」を測るため、
//    この受入の中だけで 1 件足した状態を作る（**コードは触らない**）。
const 除外の表 = "zz_purge_keep";
await db.raw(`create table zz_purge_keep (id uuid primary key, deleted_at timestamptz)`);
await db("zz_purge_keep").insert({ id: "eeee0000-0000-4000-8000-000000000005", deleted_at: 古い });
(掃除しない表 as Map<string, string>).set(除外の表, "受入のための一時的な除外（コードには在りません）");

const r = await runPurge(db, いま);

console.log(`  母集合: 対象候補 ${r.対象候補.length} 表 / 除外 ${Object.keys(r.除外).length} 表 / 消した合計 ${r.合計}`);
t("🔴 90 日より古い行は消えた", (await db("zz_purge_a").where({ id: ID.古い }).first()) ?? null, null);
t("🟢 対照 90 日以内の行は残る", Boolean(await db("zz_purge_a").where({ id: ID.新しい }).first()), true);
t("🟢 対照 論理削除でない行は残る", Boolean(await db("zz_purge_a").where({ id: ID.生きて }).first()), true);
t("🔴 あとから足した表も自動で対象", (await db("zz_purge_later").where({ id: ID.後から }).first()) ?? null, null);
t(`🟢 対照 除外の表（${除外の表}）は消えない`, Boolean(await db(除外の表).where({ id: "eeee0000-0000-4000-8000-000000000005" }).first()), true);
t("🚨 除外が効いている（この受入で 1 件足した）", Object.keys(r.除外).length, 1);
t("🚨 除外リストが腐っていない", r.腐った除外, []);

// 🚨 走った記録
const 走行後 = await db("ohmycms_trash_purge_runs").orderBy("id", "desc").first();
t("🚨 走った記録が 1 件できた", Number((await db("ohmycms_trash_purge_runs").count({ c: "*" }).first())!.c as string), 1);
t("🚨 合計が記録されている", Number(走行後.deleted_total), r.合計);

// 🚨 2 回目は 0 件（＝「走って 0 件」と「まだ走っていない」が区別できる）
const r2 = await runPurge(db, いま);
t("🚨 2 回目は 0 件（走ったが消すものが無い）", r2.合計, 0);
t("🚨 それでも記録は 2 件（＝ 走ったことが残る）", Number((await db("ohmycms_trash_purge_runs").count({ c: "*" }).first())!.c as string), 2);

// 🚨 腐った除外を検出できるか（除外の表を落として測る）
await db.raw(`drop table ??`, [除外の表]);
const r3 = await purgeTrash(db, いま);
t("🚨 除外の表が無くなったら「腐った除外」に出る", r3.腐った除外, [除外の表]);

console.log(`判定: OK ${ok} / NG ${ng}（＝走った assert の回数）`);
await db.destroy();
process.exit(ng > 0 ? 1 : 0);
