import type { Knex } from "knex";
import { DELETED_AT_COLUMN } from "@/lib/schema/service";
import { TRASH_RETENTION_DAYS } from "./service";

/**
 * ゴミ箱の 90 日掃除（設問300 の束・2026-08-16）。
 *
 * 🚨 **対象の一覧をコードに書かない。** `information_schema` から
 * **`deleted_at` を持つ表**を実行時に引く（司令塔の判断 (ii)）。
 * ＝ **列を足した人が、掃除の一覧を直さなくても対象に入る**——**足し忘れが構造的に起きない**。
 * （一覧をコードに書くと、**正本と写しが別々に腐る**。今日ずっと見ている形）
 *
 * 🚨 **その代わり「列は在るが消してはいけない表」を分けられない**ので、
 * **消してはいけない側だけ**を下の `掃除しない表` に、**理由つきで**書く。
 *
 * 🚨 **保持日数は `TRASH_RETENTION_DAYS` を読む**（`lib/trash/service.ts` の 90）。
 * ここに `90` と書き直すと、画面の「あと何日」と掃除がずれる。
 */
export const 掃除しない表: ReadonlyMap<string, string> = new Map([
  // 🚨 **いまは空です。** 空であること自体を、実行のたびに出力へ書く（司令塔の条件②）——
  //    **空の除外は「全部消す」**なので、黙って空にしない。
  //
  // 🚨 **最初は `directus_activity`（監査）を入れていたが、外した。**
  //    【測った・2026-08-16】`directus_activity` は **`deleted_at` を持たない**ので、
  //    そもそも対象候補に入らない ＝ **除外に書いても意味が無い**
  //    （＝ 条件③の「腐った除外」に、初日から当たっていた）。
  //    **「将来のための予約」として名前を置くと、警告が毎回鳴り続けて読まれなくなる。**
  //
  // 🚨 **足すときは 1 件ごとに「なぜ消さないか」を書く**（名前だけ並べない・条件①）。
  //    そして **その表が実際に `deleted_at` を持っている**ことを確かめてから足す
  //    （持っていなければ `腐った除外` に出ます）。
]);

export type PurgeResult = {
  /** 実行時に見つけた「deleted_at を持つ表」 */
  対象候補: string[];
  /** 除外した表と理由 */
  除外: Record<string, string>;
  /** 実際に消した件数（表ごと） */
  消した: Record<string, number>;
  合計: number;
  /** 🚨 除外リストが腐っていないか（条件③） */
  腐った除外: string[];
};

/**
 * 🚨 **除外リストが腐っていないかを見る**（司令塔の条件③）。
 * 除外に書いてある表が、実際には `deleted_at` を持っていないなら、
 * **その行はもう意味が無い**（表が消えた／列が消えた／名前が変わった）。
 * 気づける道はここしか無いので、**呼び出し側が必ず出す**。
 */
function 腐った除外を探す(候補: string[]): string[] {
  return [...掃除しない表.keys()].filter((t) => !候補.includes(t));
}

/** `deleted_at` を持つ public の実体表を、実行時に引く。 */
export async function 掃除の対象候補(conn: Knex): Promise<string[]> {
  const rows = await conn("information_schema.columns as c")
    .join("information_schema.tables as t", function join() {
      this.on("t.table_name", "=", "c.table_name").andOn("t.table_schema", "=", "c.table_schema");
    })
    .where({
      "c.table_schema": "public",
      "c.column_name": DELETED_AT_COLUMN,
      "t.table_type": "BASE TABLE",
    })
    .pluck<string[]>("c.table_name");
  return [...new Set(rows)].sort();
}

/**
 * 90 日より古い論理削除の行を、実際に消す。
 *
 * @param now 「いま」を差し替えられるようにする（**時刻を偽装した受入のため**）。
 *   🚨 実行時に `new Date()` を直に読むと、**古い行を作れないので受入が書けない**。
 */
export async function purgeTrash(conn: Knex, now: Date = new Date()): Promise<PurgeResult> {
  const 候補 = await 掃除の対象候補(conn);
  const 境界 = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const 除外: Record<string, string> = {};
  const 消した: Record<string, number> = {};
  let 合計 = 0;

  for (const 表 of 候補) {
    const 理由 = 掃除しない表.get(表);
    if (理由 !== undefined) {
      除外[表] = 理由;
      continue;
    }
    // 🚨 `whereNotNull` を併せて置く。`< 境界` だけだと null は元より当たらないが、
    //    **読む人に「論理削除された行だけ」を明示する**（意図が式から読める）。
    const n = await conn(表)
      .whereNotNull(DELETED_AT_COLUMN)
      .where(DELETED_AT_COLUMN, "<", 境界)
      .delete();
    消した[表] = n;
    合計 += n;
  }

  return { 対象候補: 候補, 除外, 消した, 合計, 腐った除外: 腐った除外を探す(候補) };
}

/**
 * 掃除を 1 回走らせ、**走ったことを記録**する。
 *
 * 🚨 **0 件でも行を残す。** cron は黙って走るので、記録が無いと
 * 「**まだ 1 度も走っていない**」と「**走って 0 件だった**」が同じ顔になる。
 * 🚨 **落ちたときも行を残す**（`error` に理由）。**黙って消えない。**
 */
export async function runPurge(conn: Knex, now: Date = new Date()): Promise<PurgeResult> {
  const [run] = await conn("ohmycms_trash_purge_runs")
    .insert({ started_at: now })
    .returning<{ id: number }[]>("id");
  try {
    const r = await purgeTrash(conn, now);
    await conn("ohmycms_trash_purge_runs").where({ id: run.id }).update({
      finished_at: new Date(),
      deleted_total: r.合計,
      deleted_by_table: JSON.stringify(r.消した),
      skipped: JSON.stringify(r.除外),
    });
    return r;
  } catch (error) {
    await conn("ohmycms_trash_purge_runs").where({ id: run.id }).update({
      finished_at: new Date(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
