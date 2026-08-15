/**
 * SAML で IdP へ渡す URL（SP の Entity ID / ACS URL）。
 *
 * 🚨 **`publicBaseUrl` と `safeRelativePath` はここには無い。`lib/auth/urls.ts` にある。**
 *    元はこのファイルに置いていたが、**SAML 専用の場所に置くと、戻り先を外から受け取る
 *    他の経路（OTP・パスワード・OAuth に `?next=` を足すもの）から遠くなる**。
 *    🚨 実測: そのとき**正規表現で書かれた判定が、3 通りの入力で抜かれた**
 *    （なぜ別実装が書かれたのかは測っていない。**抜かれた事実だけが測れている**）。
 *    互換のためここからも再エクスポートしているが、**新しい呼び出しは `lib/auth/urls.ts` から**。
 */

import { publicBaseUrl, safeRelativePath } from "../urls";

export { publicBaseUrl, safeRelativePath };

/** SAML 応答の受け口（Assertion Consumer Service）。IdP にはこの URL を登録してもらう。 */
export function acsUrl(request: Request): string {
  return `${publicBaseUrl(request)}/api/auth/saml/acs`;
}

/** SP メタデータの URL。Entity ID の既定値でもある。 */
export function metadataUrl(request: Request): string {
  return `${publicBaseUrl(request)}/api/auth/saml/metadata`;
}

/**
 * 🚨 **`OHMYCMS_PUBLIC_URL` を GUI（DB）へ移さない。** 決定 2026-08-16。
 *
 * 「環境変数は最小にする」の棚卸しで候補に挙がったが、**残す**と決まった。
 * 理由は「**起動時に要るから**」では**ない**（実測: `publicBaseUrl` は要求のたびに読む関数で、
 * 呼び出し元 16 箇所はすべて要求ハンドラの中。`/api/health` は使っていない）。
 *
 * 残す理由は **利用者に変えさせないため**:
 *   この値は上の `acsUrl` / `metadataUrl` を組み立て、`metadataUrl` は
 *   **Entity ID の既定値**でもある（`ohmycms_saml_config.sp_entity_id` が空のとき）。
 *   その 3 つは **IdP 側に登録済み**なので、
 *   🚨 **画面から 1 文字変えた瞬間に、IdP の登録と食い違って SSO が黙って止まる。**
 *   利用者は SSO ボタンを押して、**エラーは IdP 側の画面に出ます**。
 *   🚨 **こちらの画面にも、こちらのログにも、何も出ません**（測れるのはここまでで、
 *      利用者が原因に到達できるかどうかは測っていません）。
 *   🚨 **この注記も「書いただけ」です。古くなっても鳴りません**（司令塔 2026-08-16 の区別）。
 *      古くなる条件: **こちら側に知らせが出るようになったとき**（SSO の失敗をこの画面か
 *      ログへ出す仕組みができたら、上の「何も出ません」は嘘になる）。
 *      そのとき**検査は落ちません。** 知らせを足す人が、ここも一緒に直してください。
 *
 * 前例（実測で確認した。伝聞ではない）:
 *   `sp_entity_id` は GUI から書ける。2026-08-14 に受入がここへ値を入れて
 *   :3102 のログインが全部落ちた。その対処が `assertSharedEntityId()`（`config.ts`）で、
 *   **loopback を拒否する**（この設定は全環境で共有されるため）。
 *   ＝ **同じ性質の値を、もう 1 つ画面から書けるようにしない。**
 *
 * 🚨 判断条件（司令塔 2026-08-16・auth の追加を採用）:
 *   ① 要求のたびに DB から読めるか → 読めなければ env（理由「起動時に要るから」）
 *   ② 読めても、**外部サービスに登録済みの値と一致していなければならない**なら env
 *      （理由「**変えさせないため**」）← **ここはこちら**
 *   🚨 理由を取り違えると、次の人が「起動時に要らない」と言って移す。
 */
