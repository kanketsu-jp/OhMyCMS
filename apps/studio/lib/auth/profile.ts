import { db } from "@/lib/db/knex";

/**
 * `directus_users.avatar_emoji` を、**その利用者の行だけ**更新する。
 *
 * 🚨 `emoji` の値の検証（一覧に載っているか等）はここではしない。
 * 呼び出し元（`app/api/auth/me/route.ts`）がサーバ側の判断として先に済ませる
 * （AGENTS.md §3.5「権限はサーバで拒否する」と同じ考え方で、ここは DB を触るだけの薄い関数）。
 *
 * 🚨 `next/*` を import しないこと（AGENTS.md §3.6）。この関数は将来 Hono へ
 * 切り出す資産の一部なので、knex 以外のフレームワーク依存を持ち込まない。
 */
export async function setAvatarEmoji(userId: string, emoji: string | null): Promise<void> {
  await db("directus_users").where({ id: userId }).update({ avatar_emoji: emoji });
}

/**
 * `directus_users.first_name` / `last_name` を、**その利用者の行だけ**更新する。
 *
 * 🚨 `fields` は**渡されたキーだけ**を更新する（`undefined` は「触らない」）。
 * `null` は「その名前を消す」で、呼び出し元（`app/api/auth/me/route.ts`）が
 * 文字列の検証・trim・空文字→null化まで済ませてから渡す。ここは DB を触るだけの薄い関数
 * （`setAvatarEmoji` と同じ考え方。AGENTS.md §3.5「権限はサーバで拒否する」）。
 *
 * 🚨 `next/*` を import しないこと（AGENTS.md §3.6）。この関数は将来 Hono へ
 * 切り出す資産の一部なので、knex 以外のフレームワーク依存を持ち込まない。
 */
export async function setProfileName(
  userId: string,
  fields: { firstName?: string | null; lastName?: string | null },
): Promise<void> {
  const update: Record<string, string | null> = {};
  if ("firstName" in fields) update.first_name = fields.firstName ?? null;
  if ("lastName" in fields) update.last_name = fields.lastName ?? null;

  // 呼び出し元が3つとも省略のとき（後で INVALID_BODY で弾く）だけここに来うる。何もしない。
  if (Object.keys(update).length === 0) return;

  await db("directus_users").where({ id: userId }).update(update);
}
