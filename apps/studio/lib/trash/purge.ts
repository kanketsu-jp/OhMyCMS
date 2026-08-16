import type { Knex } from "knex";

/**
 * ゴミ箱の 90 日掃除 — **TypeScript 側は「呼ぶだけ」の薄い口**（2026-08-16・司令塔の判断 (a)）。
 *
 * 🚨 **規則はここに書かない。** 正本は SQL 関数 `ohmycms_purge_trash()`
 * （migration `20260817040000_create_purge_trash_function.ts`）。
 * 90 日の判定・対象表の導出・除外・走行の記録は、**すべて SQL 側に 1 つだけ**在る。
 *
 * 🚨 **なぜそうするか。** 掃除は `pg_cron` が呼ぶ。cron は TypeScript を呼べないので、
 * 規則をこちらに置くと **同じ規則が 2 箇所**になる（正本と写しが別々に腐る）。
 * ＝ **1 箇所に書いて、2 つの口から呼ぶ**。この口は「アプリから手で走らせたいとき」用。
 *
 * 🚨 **ここに `90` や表の一覧を書き足さないこと。** 書いた時点で 2 箇所になる。
 */

/** SQL 関数が返すもの。**この形を決めているのも SQL 側**（ここは写しているだけ）。 */
export type PurgeResult = {
  run_id: number;
  retention_days: number;
  cutoff: string;
  /** 実行時に見つけた「deleted_at を持つ表」 */
  candidates: string[];
  /** 除外した表と理由（**空なら `{}`**。空であること自体が出る） */
  skipped: Record<string, string>;
  /** 表ごとに消した件数 */
  deleted: Record<string, number>;
  total: number;
  /** 除外に書いてあるのに、実際には対象候補に無い表（＝ もう意味の無い行） */
  rotten_skips: string[];
  /** 落ちたときだけ入る。**落ちても記録は残る**（SQL 側が書く） */
  error?: string | null;
  /**
   * 🚨 **外部キーの CASCADE で行を失いうる表**（toast の指摘・2026-08-16）。
   *
   * `deleted` は **掃除自身の `delete` が消した行数**であって、**消えた行の総数ではない**。
   * 例: ラベルを消すと割り当ては CASCADE で消えるが、掃除の `delete` は 0 行しか返さない
   * ＝ **記録は「0 件」と書くのに、実際には消えている**。
   * この一覧は「**その数の外側で消えうる場所**」を示す。**数そのものは直していない**。
   */
  cascade_may_delete?: string[];
};

/**
 * 掃除を 1 回走らせる。**中身は SQL 関数がやる。**
 *
 * @param now 「いま」を差し替えられる（**時刻を偽装した受入のため**）。
 *   省略すると SQL 側の既定（`now()`）。
 */
export async function runPurge(conn: Knex, now?: Date): Promise<PurgeResult> {
  const r =
    now === undefined
      ? await conn.raw<{ rows: { result: PurgeResult }[] }>(
          "select ohmycms_purge_trash() as result",
        )
      : await conn.raw<{ rows: { result: PurgeResult }[] }>(
          "select ohmycms_purge_trash(?) as result",
          [now],
        );
  return r.rows[0].result;
}

/** 直近の掃除の走行。**まだ 1 度も走っていなければ `null`。** */
export type LastPurgeRun = {
  started_at: string;
  finished_at: string | null;
  deleted_total: number;
  /** 落ちたときだけ入る */
  error: string | null;
};

/**
 * 直近の掃除の走行を 1 件返す。
 *
 * 🚨 **なぜ要るか。** 掃除は cron から黙って走り、落ちても `error` に**記録されるだけ**。
 * **記録に残ることと、読まれることは別**——読まれなければ、永久に落ち続ける。
 *
 * 🚨 **`/api/health` には載せない。** あそこは**認証不要**で、
 * そのファイル自身が「詳細はログにだけ出す」と決めている（誰でも運用状態を読めてしまう）。
 * → **認証済みの `/api/trash`** に載せる。**ゴミ箱を見ている人が、いちばん気にする情報**でもある。
 *
 * 🚨 **`null` は「まだ 1 度も走っていない」。** 「走って何も無かった」（`deleted_total: 0`）と
 * 混ぜないこと——**0 件の 2 つの顔を、ここで分けている**。
 */
export async function lastPurgeRun(conn: Knex): Promise<LastPurgeRun | null> {
  const row = await conn("ohmycms_trash_purge_runs")
    .orderBy("id", "desc")
    .first<{ started_at: Date; finished_at: Date | null; deleted_total: number; error: string | null }>();
  if (!row) return null;
  return {
    started_at: new Date(row.started_at).toISOString(),
    finished_at: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    deleted_total: Number(row.deleted_total),
    error: row.error,
  };
}

/**
 * 保持日数（画面の「あと何日」用）。
 *
 * 🚨 **`90` をここに書かない。** 掃除と同じ SQL 関数を読む——
 * 別々に持つと、**掃除が消したあとも画面が「あと 3 日」と言う**ようなずれ方をする。
 */
export async function trashRetentionDays(conn: Knex): Promise<number> {
  const r = await conn.raw<{ rows: { days: number }[] }>(
    "select ohmycms_trash_retention_days() as days",
  );
  return Number(r.rows[0].days);
}
