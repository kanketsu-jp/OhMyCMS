import type { Knex } from "knex";

/**
 * SAML(SSO) で入場を許可するメールアドレスの一覧。
 *
 * 堀池さん(2026-08-15・原文): 「SSOにするのでメアドリストがあればいい。
 * そこに無い人は「権限がありません」となる。」
 * → 一覧は**入場の可否だけ**を持つ（`docs/design/sso-user-provisioning.md` §2）。
 *   role の割り当てや「全員権限付与」はここには含めない(範囲外・設問未回答)。
 *
 * 🚨 照合は小文字化した完全一致で行う(`lib/auth/saml/allowlist.ts`)。
 *    保存する側でも小文字化しておくことで、素の unique 制約だけで
 *    「同じ人が大文字小文字違いで2行になる」ことを防げる。
 *
 * 一覧を足す/消す画面・APIは今回作らない(仕様の範囲外)。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ohmycms_saml_allowed_emails", (table) => {
    table.uuid("id").primary();
    table.string("email", 255).notNullable().unique();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_saml_allowed_emails");
}
