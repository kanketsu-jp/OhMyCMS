import { db } from "@/lib/db/knex";

/**
 * SAML(SSO) の許可リスト照合。
 *
 * 🚨 契約 `AGENTS.md §3.6`: `next/*` を import しない。
 *
 * `docs/design/sso-user-provisioning.md` §2 のとおり、
 * 照合は**小文字化した完全一致**でのみ行う。前方一致・ドメイン一致にはしない
 * (「@example.com なら全員」は別の機能。欲しければ改めて決める)。
 */
export async function isAllowedEmail(email: string | null): Promise<boolean> {
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const row = await db("ohmycms_saml_allowed_emails").select("id").where({ email: normalized }).first();

  return row !== undefined;
}

/**
 * `directus_users.auth_data` は複数の書き手が共有する json 列
 * (SAML 自身が `groups`、Google が `picture`、dev-login が `source` を書く。
 * `lib/auth/sessions.ts` の `authDataRecord` と同じ理由・同じ形)。
 * 丸ごと上書きすると他の書き手のキーを消してしまうため、既存の値を安全に読み出してから広げる。
 */
function authDataRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return authDataRecord(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

/**
 * 許可リストの判定結果を `directus_users.auth_data` に記録する。
 *
 * 🚨 ここではポリシーの付与・剥奪を一切行わない。一覧に無い人を落とすのは
 * 認可の層(`requireAdminAccess` 等が既に 403 を投げる)であって、ここではない
 * (`docs/design/sso-user-provisioning.md` §1)。
 *
 * 記録する理由: 一覧に入れ忘れた人が来たとき、その人が誰か分かるようにするため。
 * 記録が無いと、管理者は誰を追加すべきか分からない(設計 §1 の3つ目の理由)。
 */
export async function recordAllowlistCheck(userId: string, allowed: boolean): Promise<void> {
  const existing = await db<{ id: string; auth_data: unknown }>("directus_users")
    .select("auth_data")
    .where("id", userId)
    .first();

  await db("directus_users")
    .where("id", userId)
    .update({
      auth_data: {
        ...authDataRecord(existing?.auth_data),
        saml_allowed: allowed,
        saml_allowed_checked_at: new Date().toISOString(),
      },
    });
}
