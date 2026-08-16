import type { Knex } from "knex";

/**
 * local admin を **id** で引けるようにする（設問なし・`guards-keyed-by-name-break-silently.md` の適用）。
 *
 * 🚨 なぜ要るか（実測 2026-08-16・onboard の台）:
 *   管理者の email を本物のアドレスへ変えると、パスワードでログインできなくなる
 *   （🟢 変える前 200 → 🔴 変えた後 **401 AUTH_FAILED「パスワードが正しくありません」** → 🟢 戻すと 200）。
 *   原因は `localAdminUserId()` が `email = LOCAL_ADMIN_EMAIL` で引いていたこと。
 *   🚨 **パスワードは合っているのに「パスワードが正しくありません」と出る**ので、
 *   利用者からは原因が分からない。
 *
 * 🚨 email は「あとで人が変える値」であり、さらに **外部（IdP）が変える値**でもある
 *   （`lib/auth/saml/verify.ts` の `upsertSamlUser` が、IdP の送ってきた email で上書きする。
 *    実測 2026-08-16: この環境で SAML は **11 件**通っている。**経路は生きている**）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    // 🚨 nullable。既存インストールでは、この migration の時点で埋まらないことが在る（下記）。
    table.uuid("local_admin_user_id").nullable();
  });

  // 🚨 いま `email = LOCAL_ADMIN_EMAIL` の行が在るなら、その id を入れる（移行の 1 回で埋める）。
  const filled = await knex.raw(
    `
    UPDATE ohmycms_settings s
       SET local_admin_user_id = u.id
      FROM directus_users u
     WHERE u.email = ?
       AND s.local_admin_user_id IS NULL
    `,
    ["local-admin@localhost"],
  );

  // 🚨 **埋まらなかったことを黙らせない**（司令塔の判断②）。
  //    「埋まらなかった 0 件」と「そもそも探していない 0 件」は別なので、両方を出す。
  const [{ count: candidates }] = await knex("directus_users")
    .where({ email: "local-admin@localhost" })
    .count({ count: "*" });
  const [{ count: settingsRows }] = await knex("ohmycms_settings").count({ count: "*" });
  const updated = (filled as { rowCount?: number }).rowCount ?? 0;

  // 🚨 **初回起動では黙る**（2026-08-17。**一度ここで嘘を出した**）。
  //    まっさらな DB では `ohmycms_settings` も `directus_users` も 0 行なので、
  //    下の「埋められませんでした」が **必ず** 出る。だがそれは異常ではなく、
  //    **初期設定がこれから id を書く**というだけ。**新規インストールの全員に
  //    「ログインは通りません」と嘘を伝えることになる**ので、条件を分ける。
  //    🚨 黙るときも**黙った理由を 1 行残す**（「見ていない 0」と読まれないため）。
  if (Number(settingsRows) === 0) {
    console.info(
      "ℹ️ ohmycms_settings に行がありません（＝ まだ初期設定前）。\n" +
        "  local_admin_user_id は初期設定のときに入ります。**異常ではありません。**",
    );
  } else if (Number(candidates) === 0) {
    console.warn(
      "🚨 local_admin_user_id を埋められませんでした（email='local-admin@localhost' の行が 0 件）。\n" +
        "  🚨 これは『探したが無かった』です（『探していない』ではありません）。\n" +
        "  この環境では、初期設定で作った管理者の email が既に変わっている可能性が在ります。\n" +
        "  → 画面か CLI で、どの利用者が local admin かを指定してください。\n" +
        "  （指定するまで、初期設定後のパスワードログインは通りません）",
    );
  } else if (updated === 0) {
    console.warn(
      `🚨 候補は ${candidates} 件在るのに、1 行も更新されませんでした。` +
        "  ohmycms_settings の行が無いか、既に別の値が入っています。",
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_settings", (table) => {
    table.dropColumn("local_admin_user_id");
  });
}
