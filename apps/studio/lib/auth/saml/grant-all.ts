import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/knex";
import { getSamlConfig } from "@/lib/auth/saml/config";

/**
 * 「全員権限付与」（`docs/design/sso-user-provisioning.md` §2.1）。
 *
 * 堀池さん(2026-08-15・原文): 「SSO設定時に『全員権限付与』にするとroleを決めてそれで
 * みんなが付与されるようになる」。
 *
 * 🚨 契約 `AGENTS.md §3.6`: `next/*` を import しない。
 *
 * 🚨 「role」は実装上「ポリシー」。`directus_roles` は0行、`directus_access` は
 *    すべて `role=NULL・policy=<uuid>` の実測（`.temp/2026-08-15/spec-grant-all.md` §2）に基づく。
 *
 * 🚨 **既存の割り当てを消す処理はここに書かない**（設問252の回答は A・残す）。
 *    この関数は付与のみを行う。剥奪は別の話（未実装・範囲外）。
 */
export type GrantAllResult = "granted" | "already" | "off";

/**
 * SSO で入ってきた利用者に、設定されたポリシーを付与する。
 *
 * `app/api/auth/dev-login/route.ts` の `ensureDevAdminAccess` と同じ
 * 「先に select、無いときだけ insert」の形（🚨 毎回のログインで `directus_access` の行を増やさない）。
 */
export async function applyGrantAll(userId: string): Promise<GrantAllResult> {
  const config = await getSamlConfig();
  if (!config.grantAllEnabled || !config.grantAllPolicy) {
    return "off";
  }

  const policyId = config.grantAllPolicy;

  const existingAccess = await db("directus_access")
    .select("id")
    .where({ user: userId, policy: policyId })
    .first();

  if (existingAccess) {
    return "already";
  }

  await db("directus_access").insert({
    id: randomUUID(),
    user: userId,
    role: null,
    policy: policyId,
    sort: null,
  });

  return "granted";
}
