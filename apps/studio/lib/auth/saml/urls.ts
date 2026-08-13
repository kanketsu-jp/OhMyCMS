/**
 * SAML で IdP へ渡す URL（SP の Entity ID / ACS URL）。
 *
 * 🚨 **`publicBaseUrl` と `safeRelativePath` はここには無い。`lib/auth/urls.ts` にある。**
 *    元はこのファイルに置いていたが、**SAML 専用の場所に置くと、次に戻り先を
 *    外から受け取る人（OTP・パスワード・OAuth に `?next=` を足す人）が存在に気づかず、
 *    また正規表現で書いて抜かれる**（実際に 3 通り抜かれた）。
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
