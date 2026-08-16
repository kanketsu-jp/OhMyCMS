/**
 * 90 日の掃除の受入（設問300 の束・2026-08-16）。
 *
 * 🚨 **pg_cron が呼ぶのと同じもの（SQL 関数）を、この受入も直接呼ぶ。**
 * TypeScript の `runPurge` を測っても、それは**薄い口**を測っているだけで、
 * **cron から走ったときの振る舞いを 1 つも見ていない**。
 * 🟢 そのうえで、**薄い口からも 1 回呼んで、同じ形が返ること**を対照として見る
 * （＝ **口が 2 つとも生きている**）。
 *
 * 🚨 **使い捨ての postgres でしか走らせない**（共有 DB のポートを渡すと止まる）。
 * 終了コード: 0 = 全部通った / 1 = 期待と違う / 2 = 前提が整っていない
 */
import knex from "knex";
import { runPurge, trashRetentionDays, type PurgeResult } from "../lib/trash/purge";

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

/** 🚨 cron が呼ぶのと同じ口。**TypeScript を経由しない。** */
const sqlで走らせる = async (now: Date): Promise<PurgeResult> =>
  (await db.raw<{ rows: { result: PurgeResult }[] }>(
    "select ohmycms_purge_trash(?) as result", [now])).rows[0].result;

const 数 = async (sql: string) =>
  Number((await db.raw<{ rows: { c: string }[] }>(sql)).rows[0].c);

const 日 = 24 * 60 * 60 * 1000;
const いま = new Date("2026-08-16T12:00:00Z");

// 🚨 保持日数も SQL から引く。**ここに 90 と書くと、正本が 2 つになる。**
const 保持 = await trashRetentionDays(db);
t("🚨 保持日数は SQL 側の正本から来る", 保持, 90);
const 古い = new Date(いま.getTime() - (保持 + 5) * 日);
const 新しい = new Date(いま.getTime() - 3 * 日);

// 🚨 「まだ 1 度も走っていない」を、走らせる前に測る
t("🚨 まだ 1 度も走っていない（記録 0 件）",
  await 数("select count(*) c from ohmycms_trash_purge_runs"), 0);

// 使い捨ての表を 3 つ。うち 1 つは「あとから足した表」＝ 一覧を書かないことの証明。
await db.raw(`create table zz_purge_a (id uuid primary key, deleted_at timestamptz)`);
await db.raw(`create table zz_purge_later (id uuid primary key, deleted_at timestamptz)`);
await db.raw(`create table zz_purge_keep (id uuid primary key, deleted_at timestamptz)`);
const ID = {
  古い: "aaaa0000-0000-4000-8000-000000000001",
  新しい: "bbbb0000-0000-4000-8000-000000000002",
  生きて: "cccc0000-0000-4000-8000-000000000003",
  後から: "dddd0000-0000-4000-8000-000000000004",
  除外: "eeee0000-0000-4000-8000-000000000005",
};
await db("zz_purge_a").insert([
  { id: ID.古い, deleted_at: 古い },
  { id: ID.新しい, deleted_at: 新しい },
  { id: ID.生きて, deleted_at: null },
]);
await db("zz_purge_later").insert({ id: ID.後から, deleted_at: 古い });
await db("zz_purge_keep").insert({ id: ID.除外, deleted_at: 古い });

// 🚨 除外リストは **いまは空**。効くことを測るため、**この受入の中だけ** 1 件足す。
//    ＝ 本番の migration は触らない（差し替えて、最後に戻す）。
const 除外を差し替える = (rows: string) => db.raw(`
  create or replace function ohmycms_trash_purge_skip()
  returns table(table_name text, reason text)
  language sql immutable as $fn$
    select v.table_name, v.reason from (values ${rows}) as v(table_name, reason)
    where v.table_name is not null
  $fn$;`);
await 除外を差し替える(`('zz_purge_keep'::text, '受入のための一時的な除外'::text)`);

const r = await sqlで走らせる(いま);
console.log(`  母集合: 対象候補 ${r.candidates.length} 表 / 除外 ${Object.keys(r.skipped).length} 表 / 消した合計 ${r.total}`);

t("🔴 90 日より古い行は消えた", (await db("zz_purge_a").where({ id: ID.古い }).first()) ?? null, null);
t("🟢 対照 90 日以内の行は残る", Boolean(await db("zz_purge_a").where({ id: ID.新しい }).first()), true);
t("🟢 対照 論理削除でない行は残る", Boolean(await db("zz_purge_a").where({ id: ID.生きて }).first()), true);
t("🔴 あとから足した表も自動で対象", (await db("zz_purge_later").where({ id: ID.後から }).first()) ?? null, null);
t("🟢 対照 除外の表は消えない", Boolean(await db("zz_purge_keep").where({ id: ID.除外 }).first()), true);
t("🚨 除外が効いている（受入の中で 1 件足した）", Object.keys(r.skipped).length, 1);
t("🚨 除外リストが腐っていない", r.rotten_skips, []);

const 走行 = await db("ohmycms_trash_purge_runs").orderBy("id", "desc").first();
t("🚨 走った記録が 1 件できた", await 数("select count(*) c from ohmycms_trash_purge_runs"), 1);
t("🚨 合計が記録されている", Number(走行.deleted_total), r.total);
t("🚨 除外も記録に残っている", Object.keys(走行.skipped ?? {}).length, 1);

// 🚨 2 回目 — 「走って 0 件」と「まだ走っていない」を分けられること
const r2 = await sqlで走らせる(いま);
t("🚨 2 回目は 0 件（走ったが消すものが無い）", r2.total, 0);
t("🚨 それでも記録は 2 件（＝ 走ったことが残る）",
  await 数("select count(*) c from ohmycms_trash_purge_runs"), 2);

// 🚨 腐った除外を検出できるか（除外の表を落として測る）
await db.raw(`drop table zz_purge_keep`);
const r3 = await sqlで走らせる(いま);
t("🚨 除外の表が無くなったら「腐った除外」に出る", r3.rotten_skips, ["zz_purge_keep"]);

// 🟢 対照 — **薄い口からも同じものが返る**（口が 2 つとも生きている）
const r4 = await runPurge(db, いま);
t("🟢 対照 薄い口（TypeScript）からも呼べる", typeof r4.run_id, "number");
t("🟢 対照 薄い口の結果が SQL と同じ形", Object.keys(r4).sort(), Object.keys(r3).sort());
t("🚨 薄い口の分も記録に残る（合計 4 件）",
  await 数("select count(*) c from ohmycms_trash_purge_runs"), 4);

// 後始末（この受入が差し替えた除外を元に戻す）
await 除外を差し替える(`(null::text, null::text)`);
t("🟢 後始末 除外を空へ戻した",
  Object.keys((await sqlで走らせる(いま)).skipped).length, 0);

console.log(`判定: OK ${ok} / NG ${ng}（＝走った assert の回数）`);
await db.destroy();
process.exit(ng > 0 ? 1 : 0);
