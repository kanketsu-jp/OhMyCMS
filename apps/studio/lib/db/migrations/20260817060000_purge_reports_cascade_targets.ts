import type { Knex } from "knex";

// 掃除の記録が「消えた行」を数えていないことを、結果に書く（toast の指摘・2026-08-16）。
//
// 🚨 **何が問題か。** `deleted` は **掃除自身の `delete` が消した行数**であって、
// **消えた行の総数ではない**。
// 例: `ohmycms_labels` の行を消すと、`ohmycms_label_assignments` は
// **外部キーの ON DELETE CASCADE で消える**が、掃除の `delete` はその表で 0 行しか返さない。
// ＝ 🚨 **記録は「割り当て 0 件」と書くのに、実際には消えている。**
//
// 🚨 **数そのものは直していない。**（CASCADE の行数を正しく数えるには、
// 掃除の前後で全表を数えるか、トリガで拾うしかなく、どちらも掃除自体より重い）
// **代わりに「その数の外側で消えうる場所」を出す。**
// ＝ **数が嘘をつかないようにするのではなく、数が何を数えていないかを一緒に出す。**
//
// 【測った・2026-08-16】使い捨ての DB で再現:
//   90 日超のラベル 1 件 ＋ その割り当て 1 件 → 掃除を呼ぶ
//   → ラベルは消え、**割り当ても消えた**。だが `deleted` は
//     `{"ohmycms_labels": 1, "ohmycms_label_assignments": 0}` と書いた。
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
      v_targets text[] := '{}';
      v_cascade text[];
      v_skipped jsonb := '{}'::jsonb;
      v_deleted jsonb := '{}'::jsonb;
      v_rotten text[];
      v_total integer := 0;
      v_table text;
      v_reason text;
      v_n integer;
      v_error text := null;
    begin
      -- 🚨 記録の行は例外ブロックの外で作る（中で作ると、落ちたときに一緒に巻き戻る）。
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
          v_targets := array_append(v_targets, v_table);
          execute format('delete from %I where deleted_at is not null and deleted_at < $1', v_table)
            using v_cutoff;
          get diagnostics v_n = row_count;
          v_deleted := v_deleted || jsonb_build_object(v_table, v_n);
          v_total := v_total + v_n;
        end loop;

        -- 🚨 掃除の対象を参照していて、ON DELETE CASCADE を持つ表。
        --    ＝ **この掃除で行を失いうるが、上の数には入らない場所**。
        select coalesce(array_agg(distinct src.relname::text order by src.relname::text), '{}')
          into v_cascade
          from pg_constraint con
          join pg_class src on src.oid = con.conrelid
          join pg_class tgt on tgt.oid = con.confrelid
         where con.contype = 'f'
           and con.confdeltype = 'c'
           and tgt.relname::text = any(v_targets);
      exception when others then
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
        'cascade_may_delete', to_jsonb(coalesce(v_cascade, '{}')),
        'error', v_error);
    end;
    $fn$;
  `);
}

// 🚨 down は `20260817050000` の版（`cascade_may_delete` を出さない版）へ戻す。
//    **戻すと、記録の数が「何を数えていないか」を言わなくなる。**
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
      v_error text := null;
    begin
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
        v_error := SQLERRM;
        v_total := 0;
        v_deleted := '{}'::jsonb;
      end;
      update ohmycms_trash_purge_runs
         set finished_at = now(), deleted_total = v_total,
             deleted_by_table = v_deleted, skipped = v_skipped, error = v_error
       where id = v_run_id;
      return jsonb_build_object(
        'run_id', v_run_id, 'retention_days', v_retention, 'cutoff', v_cutoff,
        'candidates', to_jsonb(coalesce(v_candidates, '{}')), 'skipped', v_skipped,
        'deleted', v_deleted, 'total', v_total,
        'rotten_skips', to_jsonb(coalesce(v_rotten, '{}')), 'error', v_error);
    end;
    $fn$;
  `);
}
