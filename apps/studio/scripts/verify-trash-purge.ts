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
import { lastPurgeRun, runPurge, trashRetentionDays, type PurgeResult } from "../lib/trash/purge";

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
// 🚨 「まだ 1 度も走っていない」は、画面に見せる側でも null になること。
t("🚨 lastPurgeRun は走る前 null（＝ まだ 1 度も走っていない）", await lastPurgeRun(db), null);

// 使い捨ての表を 3 つ。うち 1 つは「あとから足した表」＝ 一覧を書かないことの証明。
await db.raw(`create table zz_purge_a (id uuid primary key, deleted_at timestamptz)`);
await db.raw(`create table zz_purge_later (id uuid primary key, deleted_at timestamptz)`);
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

// 🚨 ここまでは **本物の除外リスト**（migration が置いたもの）で測る。
//    ＝ **受入が差し替える前に、実物が効いていること**を見る（差し替えると実物が見えなくなる）。
const ファイル = "ffff0000-0000-4000-8000-000000000009";
await db("directus_files").insert({
  id: ファイル, storage: "local", filename_download: "zz-purge-probe.txt",
  filename_disk: "zz-purge-probe.txt", deleted_at: 古い,
});
const r0 = await sqlで走らせる(いま);
t("🚨 directus_files は除外されている（本物の一覧）", Object.keys(r0.skipped), ["directus_files"]);
t("🚨 論理削除された file の行が残る（実体が孤児にならない）",
  Boolean(await db("directus_files").where({ id: ファイル }).first()), true);
t("🟢 対照 同じ走行で zz の古い行は消えた", (await db("zz_purge_a").where({ id: ID.古い }).first()) ?? null, null);

// 🚨 ここから先は、除外が効くことを別の表でも測るため、**この受入の中だけ**差し替える。
//    ＝ 本番の migration は触らない（最後に本物へ戻す）。
const 除外を差し替える = (rows: string) => db.raw(`
  create or replace function ohmycms_trash_purge_skip()
  returns table(table_name text, reason text)
  language sql immutable as $fn$
    select v.table_name, v.reason from (values ${rows}) as v(table_name, reason)
    where v.table_name is not null
  $fn$;`);
await 除外を差し替える(`('zz_purge_keep'::text, '受入のための一時的な除外'::text)`);
// 🚨 台は**差し替えの後**に作る。先に作ると、**1 回目（本物の一覧）で消えてしまう**
//    ＝ そのとき `zz_purge_keep` はまだ除外に入っていないので、当然の結果だった。
await db.raw(`create table zz_purge_keep (id uuid primary key, deleted_at timestamptz)`);
await db("zz_purge_keep").insert({ id: ID.除外, deleted_at: 古い });
// 🚨 除外の表は、**差し替えた後に作る**。
//    先に作ると、**本物の一覧で走る 1 回目に（まだ除外に入っていないので）消える**
//    ＝ 実際にそれで 1 件赤くなった。**「いつ在るか」まで含めて台**。
// 🚨 差し替えている間は directus_files が除外から外れる ＝ **この受入の中でだけ消えうる**。
//    使い捨ての DB なので実害は無いが、**本物の一覧に戻すところまでを受入に入れる**。

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
t("🚨 走った記録が 2 件（本物 1 ＋ 差し替え後 1）", await 数("select count(*) c from ohmycms_trash_purge_runs"), 2);
t("🚨 合計が記録されている", Number(走行.deleted_total), r.total);
t("🚨 除外も記録に残っている", Object.keys(走行.skipped ?? {}).length, 1);

// 🚨 2 回目 — 「走って 0 件」と「まだ走っていない」を分けられること
const r2 = await sqlで走らせる(いま);
t("🚨 2 回目は 0 件（走ったが消すものが無い）", r2.total, 0);
t("🚨 それでも記録は増える（＝ 走ったことが残る）",
  await 数("select count(*) c from ohmycms_trash_purge_runs"), 3);

// 🚨 腐った除外を検出できるか（除外の表を落として測る）
await db.raw(`drop table zz_purge_keep`);
const r3 = await sqlで走らせる(いま);
t("🚨 除外の表が無くなったら「腐った除外」に出る", r3.rotten_skips, ["zz_purge_keep"]);

// 🟢 対照 — **薄い口からも同じものが返る**（口が 2 つとも生きている）
const r4 = await runPurge(db, いま);
t("🟢 対照 薄い口（TypeScript）からも呼べる", typeof r4.run_id, "number");
t("🟢 対照 薄い口の結果が SQL と同じ形", Object.keys(r4).sort(), Object.keys(r3).sort());
t("🚨 薄い口の分も記録に残る（合計 5 件）",
  await 数("select count(*) c from ohmycms_trash_purge_runs"), 5);

// 🚨 後始末 — **本物の一覧へ戻す**（空へ戻すと directus_files が外れたままになる）。
await 除外を差し替える(`('directus_files'::text, '実体（バイト）を消す手が SQL に無い'::text)`);
t("🚨 後始末 本物の除外（directus_files）へ戻した",
  Object.keys((await sqlで走らせる(いま)).skipped), ["directus_files"]);

// 🚨 CASCADE で消えた行は、走行記録に入らない（toast の指摘・2026-08-16）。
//    ラベルを掃除すると、割り当ては外部キーの CASCADE で消えるが、
//    掃除自身の delete は 0 行しか返さない ＝ **記録は「0 件」と書く**。
const ラベル = "cccc2222-0000-4000-8000-00000000000c";
await db("ohmycms_labels").insert({ id: ラベル, name: "zz-purge-label", color: "#000000", deleted_at: 古い });
await db("ohmycms_label_assignments").insert({
  label_id: ラベル, target_type: "file", target_id: ID.新しい,
});
const 前 = Number((await db("ohmycms_label_assignments").where({ label_id: ラベル }).count({ c: "*" }).first())!.c);
t("🟢 対照 割り当てが 1 件在る（掃除の前）", 前, 1);
const rc = await sqlで走らせる(いま);
t("🔴 90 日超のラベルは消えた", (await db("ohmycms_labels").where({ id: ラベル }).first()) ?? null, null);
t("🔴 割り当ても消えた（外部キーの CASCADE）",
  Number((await db("ohmycms_label_assignments").where({ label_id: ラベル }).count({ c: "*" }).first())!.c), 0);
t("🚨 だが記録は割り当てを 0 件と書く（＝ CASCADE は数えていない）",
  (rc.deleted as Record<string, number>)["ohmycms_label_assignments"], 0);
t("🟢 対照 ラベル自身は 1 件と書く（＝ 直接消した分は数えている）",
  (rc.deleted as Record<string, number>)["ohmycms_labels"], 1);
t("🚨 CASCADE で消えうる表が、結果に出る",
  (rc.cascade_may_delete ?? []).includes("ohmycms_label_assignments"), true);

// 🚨 落ちたときに、人が読める場所へ出るか（記録に残るだけでは誰も見ない）
await db.raw(`create table zz_purge_boom (id uuid primary key, deleted_at timestamptz)`);
await db("zz_purge_boom").insert({ id: "ffff1111-0000-4000-8000-00000000000b", deleted_at: 古い });
await db.raw(`create function zz_boom() returns trigger language plpgsql as
  $fn$ begin raise exception 'zz-boom'; end $fn$`);
await db.raw(`create trigger zz_boom_t before delete on zz_purge_boom for each row execute function zz_boom()`);
const 落ちた = await sqlで走らせる(いま);
t("🔴 落ちたら error が返る", typeof 落ちた.error, "string");
const 見える = await lastPurgeRun(db);
t("🔴 落ちたことが lastPurgeRun から読める", (見える?.error ?? "").includes("zz-boom"), true);
t("🟢 対照 その走行の deleted_total は 0（＝ 巻き戻っていない）", 見える?.deleted_total, 0);
await db.raw(`drop table zz_purge_boom`); await db.raw(`drop function zz_boom()`);
const 直った = await sqlで走らせる(いま);
t("🟢 対照 直したら error は無い", 直った.error ?? null, null);
t("🟢 対照 lastPurgeRun も error なしへ戻る", (await lastPurgeRun(db))?.error ?? null, null);

console.log(`判定: OK ${ok} / NG ${ng}（＝走った assert の回数）`);
await db.destroy();
process.exit(ng > 0 ? 1 : 0);
