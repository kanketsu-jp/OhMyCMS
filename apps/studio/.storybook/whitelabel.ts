/**
 * ホワイトラベル設定の一点集約。
 *
 * idea.md §Storybookの同期:
 *   「使うクライアントの情報(ロゴやサービス名)を環境変数として設定しておくことで
 *     それが本体はもちろん Storybook にも反映されるようにする」
 *
 * ここは Node 側(main.ts / manager 生成時)で評価される。
 * ブラウザ側へは main.ts の `env` と `managerHead` の 2 経路で渡している
 * (preview の iframe と manager の親フレームは別バンドルなので 2 経路必要)。
 */

/** 既定のサービス名。環境変数が無いときはこれ。 */
export const DEFAULT_PROJECT_NAME = "OhMyCMS";

/** サービス名。`OHMYCMS_PROJECT_NAME` で差し替えられる。 */
export function projectName(): string {
  return process.env.OHMYCMS_PROJECT_NAME?.trim() || DEFAULT_PROJECT_NAME;
}

/** ロゴ画像の URL。空なら文字だけのブランド表示になる。 */
export function projectLogoUrl(): string {
  return process.env.OHMYCMS_PROJECT_LOGO_URL?.trim() || "";
}
