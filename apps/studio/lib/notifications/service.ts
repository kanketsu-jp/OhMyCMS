/**
 * アプリ内通知（F2 §2-F）のドメイン層。
 *
 * 🚨 権限の要点（AGENTS.md §3.5）: **他人宛の通知は SELECT しない。**
 *    「全件取ってからアプリで絞る」実装にすると、フィルタを1行消しただけで漏れる。
 *    ここでは recipient を WHERE に必ず入れ、更新も `where(id).andWhere(recipient)` にする
 *    （ID を直打ちされても他人の行に届かない ＝ MVP 受入基準 #8 と同じ考え方）。
 *
 * 契約 §2-2: `next/*` を import しない。
 */

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/knex";
import { ApiError } from "@/lib/schema/errors";

export type Notification = {
  id: string;
  message_key: string;
  message_params: Record<string, unknown> | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
  category: NotificationCategory;
};

/**
 * お知らせの区分。堀池さん（2026-08-15）:
 * > 「お知らせページでは最初にタブで『**あなた宛**』『**システム関係**』があり、
 * >   **あなた宛がデフォルト**。システム関係はアップデートのことなど。」
 *
 * personal = その人に向けて起きたこと（返信が来た・ポリシーが付いた 等）
 * system   = 全員に同じことを知らせるもの（新しいバージョンが出た 等）
 */
export type NotificationCategory = "personal" | "system";

type NotificationRow = {
  id: string;
  recipient: string;
  message_key: string;
  message_params: Record<string, unknown> | null;
  link: string | null;
  created_at: Date | string;
  read_at: Date | string | null;
  category: NotificationCategory;
};

const MAX_LIMIT = 100;

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function present(row: NotificationRow): Notification {
  return {
    id: row.id,
    message_key: row.message_key,
    message_params: row.message_params ?? null,
    link: row.link,
    created_at: toIso(row.created_at) as string,
    read_at: toIso(row.read_at),
    // 🚨 列を足す前に作られた行は null になりうるので、既定へ寄せる
    //    （タブのどちらにも出ない通知を作らない）。
    category: row.category ?? "personal",
  };
}

/**
 * 自分宛の通知を新しい順で返す。
 * @param recipient 必ず呼び出し側の本人 ID を渡す。クエリ文字列から取らないこと
 */
export async function listNotifications(
  recipient: string,
  {
    unreadOnly = false,
    limit = 50,
    category,
  }: { unreadOnly?: boolean; limit?: number; category?: NotificationCategory } = {},
): Promise<{ data: Notification[]; unread: number }> {
  const capped = Math.min(Math.max(limit, 1), MAX_LIMIT);

  const query = db<NotificationRow>("ohmycms_notifications")
    .where({ recipient })
    .orderBy("created_at", "desc")
    .limit(capped);
  if (unreadOnly) query.whereNull("read_at");
  // 🚨 タブの絞り込みも **WHERE でやる**（取ってから捨てない）。
  if (category) query.andWhere({ category });

  const rows = await query;

  // 未読件数は絞り込みと無関係に「自分宛の未読」を数える（バッジ用）。
  const [{ count }] = await db("ohmycms_notifications")
    .where({ recipient })
    .whereNull("read_at")
    .count<{ count: string }[]>({ count: "*" });

  return { data: rows.map(present), unread: Number(count) };
}

/**
 * 既読にする。
 * 🚨 **recipient を WHERE に必ず含める。** 他人の通知 ID を直打ちされても 0 件更新になり、
 *    404 を返す（＝存在を教えない）。
 */
export async function markRead(
  id: string,
  recipient: string,
  read: boolean,
): Promise<Notification> {
  const updated = await db<NotificationRow>("ohmycms_notifications")
    .where({ id, recipient })
    .update({ read_at: read ? new Date() : null })
    .returning("*");

  const row = Array.isArray(updated) ? updated[0] : undefined;
  if (!row) {
    // 他人の行でも「存在しない」と同じ応答にする（存在を漏らさない）。
    throw new ApiError(404, "NOT_FOUND", "通知が見つかりません");
  }
  return present(row);
}

/**
 * 通知を作る。**アプリ内部から呼ぶ用**で、API の入口は生やさない
 * （誰でも他人へ通知を送れると迷惑メールの箱になる）。
 *
 * @param messageKey 辞書キー。ここに翻訳済みの文言を入れないこと
 */
export async function createNotification(input: {
  recipient: string;
  messageKey: string;
  params?: Record<string, unknown>;
  link?: string | null;
  /** 既定は personal。全員向けの告知だけ system にする */
  category?: NotificationCategory;
}): Promise<Notification> {
  // リンクはアプリ内の相対パスだけ許す（通知から外部サイトへ飛ばさない）。
  const link = input.link ?? null;
  if (link && !link.startsWith("/")) {
    throw new ApiError(400, "INVALID_LINK", "link はアプリ内の相対パスで指定してください");
  }

  const category = input.category ?? "personal";
  const row = {
    id: randomUUID(),
    recipient: input.recipient,
    message_key: input.messageKey,
    message_params: input.params ? JSON.stringify(input.params) : null,
    link,
    category,
  };
  await db("ohmycms_notifications").insert(row);

  return {
    id: row.id,
    message_key: row.message_key,
    message_params: input.params ?? null,
    link,
    created_at: new Date().toISOString(),
    read_at: null,
    category,
  };
}

/**
 * 自分宛を**まとめて既読にする**。
 * 堀池さんのヘッダー案（アクションボタン）で、お知らせ一覧の主要操作にあたる。
 *
 * 🚨 `recipient` を必ず WHERE に入れる（他人の分を既読にしない）。
 * @returns 既読にした件数。**0 件は「もともと未読が無かった」**で、失敗ではない
 */
export async function markAllRead(
  recipient: string,
  { category }: { category?: NotificationCategory } = {},
): Promise<number> {
  const query = db("ohmycms_notifications").where({ recipient }).whereNull("read_at");
  if (category) query.andWhere({ category });
  return query.update({ read_at: new Date() });
}
