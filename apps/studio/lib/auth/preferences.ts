import { db } from "@/lib/db/knex";

type PreferenceRow = {
  key: string;
  value: unknown;
};

/** 利用者本人の設定をキーと値のオブジェクトで返す。 */
export async function getUserPreferences(userId: string): Promise<Record<string, unknown>> {
  const rows = await db<PreferenceRow>("directus_user_preferences")
    .select("key", "value")
    .where("user_id", userId);

  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

/** 利用者本人の設定を1キーだけ保存する。 */
export async function setUserPreference(
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  await db("directus_user_preferences")
    .insert({ user_id: userId, key, value, updated_at: db.fn.now() })
    .onConflict(["user_id", "key"])
    .merge({ value, updated_at: db.fn.now() });
}
