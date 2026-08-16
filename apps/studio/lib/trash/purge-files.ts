import type { Knex } from "knex";
import { deleteStoredObjects } from "@/lib/files/service";
import { trashRetentionDays } from "./purge";

/**
 * **ファイルだけの 90 日掃除**（2026-08-17・案A）。
 *
 * 🚨 **なぜ SQL 側の掃除に載らないのか。**
 * `ohmycms_purge_trash()` は `directus_files` を**除外**している
 * （migration `20260817040000_create_purge_trash_function.ts` の除外リストに理由が在る）。
 * **実体（バイト）の場所は行の中（`filename_disk` / `compressed_key`）にしか無い**ので、
 * **SQL が行を消した瞬間、その実体は二度と辿れない孤児**になる。
 * **SQL からは storage（local FS / S3）へ手が届かない。**
 * ＝ [ファイルの削除は 2 回消す](../../../knowledge/decisions/deleting-a-file-is-two-deletes.md)
 *
 * 🚨 **だから、ここが「例外を作った側の責任」を果たす場所。**
 * 除外しただけで誰も消さなければ、**ゴミ箱のファイルは永遠に残る**。
 *
 * 🚨 **保持日数をここに書かない。** `trashRetentionDays()` で SQL 側から読む——
 * 90 を 2 箇所に持つと、**掃除が消したあとも画面が「あと 3 日」と言う**ずれ方をする。
 */

export type FilePurgeResult = {
  retention_days: number;
  /** この時刻より前に捨てられた行が対象（ISO 文字列） */
  cutoff: string;
  /** 対象として引けた件数 */
  candidates: number;
  /** 実体と行の**両方**を消せた id */
  deleted: string[];
  /**
   * 消せなかった id と理由。**行は残してある**（次の回で拾える）。
   * 🚨 **ここが空でないのに「掃除した」と報告しないこと。**
   */
  failed: { id: string; error: string }[];
};

/**
 * 期限切れのファイルを、**実体 → 行**の順で消す。
 *
 * 🚨 **1 件失敗しても止めない。** 保管先が一時的に落ちているだけのことが在り、
 *    そこで全部止めると**残りが永久に溜まる**。失敗した id は返して、行は残す。
 *
 * 🚨 **トランザクションで囲っていない。** `deleteStoredObjects` は
 *    `lib/files` 側の接続で行を読む（`conn` ではない）ので、囲っても
 *    **同じトランザクションの中は見えない**。そして**実体の削除は巻き戻せない**——
 *    囲うと「行だけ戻って、実体は消えている」という、いちばん悪い状態を作れてしまう。
 *
 * @param conn 対象を引く接続。呼ぶ側が渡す（受入で使い捨ての DB を指せるように）。
 * @param now 「いま」を差し替えられる（**時刻を偽装した受入のため**）。
 */
export async function purgeExpiredFiles(conn: Knex, now?: Date): Promise<FilePurgeResult> {
  const retentionDays = await trashRetentionDays(conn);
  const base = now ?? new Date();
  const cutoff = new Date(base.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  // 🚨 **素の `conn(...)` を使う**。ゴミ箱に在る行（`deleted_at` が入っている行）が対象なので、
  //    `liveRows()` を通すと **1 件も引けない**（`lib/files/live.ts` が言う例外はここ）。
  const rows = await conn<{ id: string }>("directus_files")
    .whereNotNull("deleted_at")
    .where("deleted_at", "<", cutoff)
    .select("id");

  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const { id } of rows) {
    try {
      // 🚨 **順番はここが全て。** 実体 → 行。
      //    逆にすると、実体の削除に失敗したとき **key を持つ行がもう無い**ので、
      //    その実体には二度と辿り着けない（＝ 孤児）。
      await deleteStoredObjects(id);
      await conn("directus_files").where({ id }).delete();
      deleted.push(id);
    } catch (error) {
      // 🚨 **行を消さない。** 実体が残っている可能性が在るので、
      //    行（＝ key の在り処）も残して、次の回で拾えるようにする。
      failed.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    retention_days: retentionDays,
    cutoff: cutoff.toISOString(),
    candidates: rows.length,
    deleted,
    failed,
  };
}
