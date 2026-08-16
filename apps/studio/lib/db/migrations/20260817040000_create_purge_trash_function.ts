import type { Knex } from "knex";

// 90 日の掃除の**正本**を SQL 側へ置く（設問300 の束・2026-08-16・司令塔の判断 (a)）。
//
// 🚨 **なぜ SQL が正本か。** 掃除は `pg_cron` が呼ぶ。cron は TypeScript を呼べないので、
//    規則を TypeScript に置くと **同じ規則が 2 箇所**になる（正本と写しが別々に腐る）。
//    → **1 箇所に書いて、2 つの口から呼ぶ**。TypeScript 側は「呼ぶだけ」の薄い口にする。
//
// 🚨 **走行の記録も、この関数の中でやる。** cron は SQL を直接呼ぶので、
//    記録が TypeScript 側に在ると **cron から走ったときだけ記録が残らない**
//    （＝「まだ 1 度も走っていない」と「cron から走った」が同じ顔になる）。
//
// 置くもの 3 つ:
//   ① `ohmycms_trash_retention_days()` … **保持日数の正本**（90）
//   ② `ohmycms_trash_purge_skip()` …… **掃除しない表と理由**（いまは空）
//   ③ `ohmycms_purge_trash(p_now)` …… 掃除の本体（①②を読む・記録も書く）
export async function up(knex: Knex): Promise<void> {
  // ① 保持日数の正本。
  // 🚨 画面の「あと何日」も、掃除も、**この 1 つ**を読む。
  //    TypeScript 側に 90 を書き直すと、画面と掃除がずれる。
  await knex.raw(`
    create or replace function ohmycms_trash_retention_days() returns integer
    language sql immutable as $fn$ select 90 $fn$;
  `);

  // ② 掃除しない表と、その理由。
  // 🚨 **いまは空**（＝ `deleted_at` を持つ表は全部掃除する）。
  //    空であること自体は、③の戻り値 `skipped` が毎回 `{}` として出すので黙らない。
  // 🚨 **足すときは 1 件ごとに理由を書く**（名前だけ並べない）。
  //    そして **その表が実際に `deleted_at` を持つ**ことを確かめてから足すこと——
  //    持っていない表を除外に書いても意味が無く、③が `rotten_skips` として報せる。
  // 🚨 `where table_name is not null` は **空の一覧を書くための形**。
  //    1 件足すときは values に 1 行足すだけでよい。
  await knex.raw(`
    create or replace function ohmycms_trash_purge_skip()
    returns table(table_name text, reason text)
    language sql immutable as $fn$
      select v.table_name, v.reason from (values
        (null::text, null::text)
      ) as v(table_name, reason)
      where v.table_name is not null
    $fn$;
  `);

  // ③ 掃除の本体。
  //
  // 🚨 **対象の一覧を書かない。** `information_schema` から「`deleted_at` を持つ表」を引く。
  //    ＝ 列を足した人が、掃除の一覧を直さなくても対象に入る（足し忘れが構造的に起きない）。
  //
  // 🚨 **`p_now` を引数にしてある。** 実行時に `now()` を直に読むと、
  //    **古い行を作れないので受入が書けない**（時刻を偽装できる形にしておく）。
  //
  // 🚨 **落ちたときの扱い（意図した形）。** 例外を捕まえて `error` に書き、**再送出しない**。
  //    再送出するとトランザクションごと巻き戻り、**記録も消える**（＝ 黙って失敗する）。
  //    途中まで消した分は確定するが、**何が起きたかは記録に残る**ほうを採る。
  await knex.raw(`
    create or replace function ohmycms_purge_trash(p_now timestamptz default now())
    returns jsonb
    language plpgsql as $fn$
    declare
      v_run_id integer;
      v_retention integer := ohmycms_trash_retention_days();
      v_cutoff timestamptz := p_now - make_interval(days => v_retention);
      v_candidates text[];
      v_skipped jsonb := '{}'::jsonb;
      v_deleted jsonb := '{}'::jsonb;
      v_rotten text[];
      v_total integer := 0;
      v_table text;
      v_reason text;
      v_n integer;
    begin
      insert into ohmycms_trash_purge_runs (started_at) values (p_now) returning id into v_run_id;

      select coalesce(array_agg(distinct c.table_name order by c.table_name), '{}')
        into v_candidates
        from information_schema.columns c
        join information_schema.tables t
          on t.table_name = c.table_name and t.table_schema = c.table_schema
       where c.table_schema = 'public'
         and c.column_name = 'deleted_at'
         and t.table_type = 'BASE TABLE';

      -- 除外に書いてあるのに、実際には対象候補に無い表（＝ もう意味の無い行）。
      select coalesce(array_agg(s.table_name), '{}') into v_rotten
        from ohmycms_trash_purge_skip() s
       where not (s.table_name = any(v_candidates));

      foreach v_table in array v_candidates loop
        select s.reason into v_reason from ohmycms_trash_purge_skip() s where s.table_name = v_table;
        if v_reason is not null then
          v_skipped := v_skipped || jsonb_build_object(v_table, v_reason);
          continue;
        end if;
        execute format('delete from %I where deleted_at is not null and deleted_at < $1', v_table)
          using v_cutoff;
        get diagnostics v_n = row_count;
        v_deleted := v_deleted || jsonb_build_object(v_table, v_n);
        v_total := v_total + v_n;
      end loop;

      update ohmycms_trash_purge_runs
         set finished_at = now(), deleted_total = v_total,
             deleted_by_table = v_deleted, skipped = v_skipped
       where id = v_run_id;

      return jsonb_build_object(
        'run_id', v_run_id,
        'retention_days', v_retention,
        'cutoff', v_cutoff,
        'candidates', to_jsonb(v_candidates),
        'skipped', v_skipped,
        'deleted', v_deleted,
        'total', v_total,
        'rotten_skips', to_jsonb(v_rotten));
    exception when others then
      update ohmycms_trash_purge_runs
         set finished_at = now(), error = SQLERRM
       where id = v_run_id;
      return jsonb_build_object('run_id', v_run_id, 'error', SQLERRM, 'total', 0);
    end;
    $fn$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`drop function if exists ohmycms_purge_trash(timestamptz)`);
  await knex.raw(`drop function if exists ohmycms_trash_purge_skip()`);
  await knex.raw(`drop function if exists ohmycms_trash_retention_days()`);
}
