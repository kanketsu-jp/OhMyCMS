import type { Knex } from "knex";

// 掃除が落ちたとき、走行の記録が**残っていなかった**のを直す（2026-08-16）。
//
// 🚨 **何が起きていたか。** `20260817040000` の関数は、本体全体を
// `begin … exception when others then … end` の 1 ブロックで囲んでいた。
// plpgsql の例外ブロックは**暗黙のサブトランザクション**なので、例外が起きると
// **そのブロックの中で行ったことが全部巻き戻る**——**記録を作る `insert` も一緒に**。
// その後で走るハンドラの `update` は、**もう存在しない行**を狙うので 0 行更新。
// ＝ 🚨 **落ちると、記録が 1 行も残らない**（「まだ 1 度も走っていない」と同じ顔になる）。
//
// 🚨 **これは私が「落ちても記録は残る」と決定文書とコミットに書いていた主張の、反証。**
//    受入に「落ちたことが `lastPurgeRun` から読めるか」を足して、初めて出た
//    （**それまでは「例外が返る」までしか測っていなかった**）。
//
// 🚨 **直し方。** `insert` を**例外ブロックの外**へ出す。
//    ブロックは「消す処理」だけを囲む ＝ 巻き戻るのは削除だけで、記録の行は残る。
export async function up(knex: Knex): Promise<void> {
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
      v_error text := null;
    begin
      -- 🚨 記録の行は**例外ブロックの外**で作る。中で作ると、落ちたときに一緒に巻き戻る。
      insert into ohmycms_trash_purge_runs (started_at) values (p_now) returning id into v_run_id;

      begin
        select coalesce(array_agg(distinct c.table_name order by c.table_name), '{}')
          into v_candidates
          from information_schema.columns c
          join information_schema.tables t
            on t.table_name = c.table_name and t.table_schema = c.table_schema
         where c.table_schema = 'public'
           and c.column_name = 'deleted_at'
           and t.table_type = 'BASE TABLE';

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
      exception when others then
        -- 🚨 ここで巻き戻るのは、この begin…end の中でやった削除だけ。
        --    記録の行（上の insert）は残るので、update が当たる。
        v_error := SQLERRM;
        v_total := 0;
        v_deleted := '{}'::jsonb;
      end;

      update ohmycms_trash_purge_runs
         set finished_at = now(), deleted_total = v_total,
             deleted_by_table = v_deleted, skipped = v_skipped, error = v_error
       where id = v_run_id;

      return jsonb_build_object(
        'run_id', v_run_id,
        'retention_days', v_retention,
        'cutoff', v_cutoff,
        'candidates', to_jsonb(coalesce(v_candidates, '{}')),
        'skipped', v_skipped,
        'deleted', v_deleted,
        'total', v_total,
        'rotten_skips', to_jsonb(coalesce(v_rotten, '{}')),
        'error', v_error);
    end;
    $fn$;
  `);
}

// 🚨 down は `20260817040000` の版（記録が残らない版）へ戻す。
//    **戻すと、落ちたときに記録が消える状態に戻る。**
//    根拠は「down を実行して測った」ではなく、**この migration を書く前に、
//    その版で受入が実際に赤だった**こと（`OK 27 / NG 1`・落ちたことが `lastPurgeRun` から読めない）。
//    🚨 **`migrate:rollback` では測れない**——使い捨ての DB は全部が 1 batch なので、
//    50 本まとめて巻き戻り、**別の理由で赤くなる**（＝ その赤は down の証拠にならない）。
export async function down(knex: Knex): Promise<void> {
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
        'run_id', v_run_id, 'retention_days', v_retention, 'cutoff', v_cutoff,
        'candidates', to_jsonb(v_candidates), 'skipped', v_skipped,
        'deleted', v_deleted, 'total', v_total, 'rotten_skips', to_jsonb(v_rotten));
    exception when others then
      update ohmycms_trash_purge_runs
         set finished_at = now(), error = SQLERRM
       where id = v_run_id;
      return jsonb_build_object('run_id', v_run_id, 'error', SQLERRM, 'total', 0);
    end;
    $fn$;
  `);
}
