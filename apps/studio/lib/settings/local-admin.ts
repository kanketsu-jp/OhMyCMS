/**
 * ローカル管理者の内部用メールアドレス。
 *
 * 🚨 なぜ独立したファイルなのか（葉モジュールにする理由）
 *    `lib/settings/service.ts` はサーバ専用（`node:crypto` の `randomUUID` と `knex` を持つ）。
 *    一方 `lib/admin/user-label.ts` はこの定数だけを使って表示判定をしており、
 *    `@/lib/settings/service` から import すると **DB 層ごとブラウザ側へ引きずってしまう**。
 *    実測（Storybook）で `layouts-adminlayout--default` story が
 *    `Module "node:crypto" has been externalized for browser compatibility.` で
 *    導入以来ずっと描画できていなかった（対照 `components-button--default` は正常）。
 *    この定数のためだけにサーバ専用モジュールをクライアント側へ引きずらないよう、
 *    `lib/auth/saml/placeholder-email.ts` と同じ「葉」の形（何も import しない）に切り出す。
 *
 * 🚨 なぜメールがあるか: メールを使わない方針だが、`directus_sessions.user` は NOT NULL、
 *    `directus_users.email` も NOT NULL + unique という DB 制約があるため、
 *    セッションの持ち主として内部専用の固定ユーザーを1人だけ持つ。
 *    **利用者には一切見せない**（画面にもAPIレスポンスにも出さない）。
 */
export const LOCAL_ADMIN_EMAIL = "local-admin@localhost";
