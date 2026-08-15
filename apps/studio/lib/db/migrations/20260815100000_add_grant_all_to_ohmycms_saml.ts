import type { Knex } from "knex";

/**
 * 「全員権限付与」（`docs/design/sso-user-provisioning.md` §2.1）。
 *
 * 堀池さん(2026-08-15・原文): 「SSO設定時に『全員権限付与』にするとroleを決めてそれで
 * みんなが付与されるようになる」。設問252の回答は A（OFF に戻しても既に付いた権限は残す）。
 *
 * 🚨 **列名は `grant_all_policy`。`grant_all_role` にしない**。
 *    `directus_roles` は **0 行**（ロールという実体がまだ無い）。実測（§2）:
 *      directus_policies … 2 行（Administrator / dev-admin。どちらも admin_access=true）
 *      directus_access   … 209 行。すべて role=NULL・policy=<uuid>
 *    したがって堀池さんの言う「role」は実装上「ポリシー」（`6469082` と同じ取り違えを繰り返さない）。
 *
 * 🚨 **既定は false。** `ohmycms_saml_config` は `CHECK (id = 1)` の単一行を
 *    :3101 / :3102 / :3103 の全環境が共有する。既定が true だと、
 *    デプロイした瞬間に全環境で全員へポリシーが付く。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_saml_config", (table) => {
    table.boolean("grant_all_enabled").notNullable().defaultTo(false);
    table.uuid("grant_all_policy");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_saml_config", (table) => {
    table.dropColumn("grant_all_enabled");
    table.dropColumn("grant_all_policy");
  });
}
