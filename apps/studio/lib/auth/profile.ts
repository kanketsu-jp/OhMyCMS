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
