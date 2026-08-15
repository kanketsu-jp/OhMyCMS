import { getSettings } from "@/lib/settings/service";
import { ApiError } from "@/lib/schema/errors";

/**
 * ドライブ連携の設定。
 *
 * 🚨 **`client_id` しか持たない。** OAuth は PKCE だけで組んであり、
 *    クライアントの秘密鍵を持たない（`lib/drive/oauth.ts` の理由参照）。
 *
 * 🚨 Cookie の名前を **`lib/auth/cookies.ts` に足していない**。あちらは認証の担当が持つ
 *    ファイルで、ドライブ連携はその外側の機能なので、**自分の側に置く**。
 *    Cookie を書く関数（`oauthCookieHeader`）は名前を引数に取るので、これで足りる。
 */
export const DRIVE_STATE_COOKIE = "drive_oauth_state";
export const DRIVE_CODE_VERIFIER_COOKIE = "drive_oauth_code_verifier";

export type DriveOAuthConfig = {
  clientId: string;
  redirectUri: string;
};

/**
 * 設定を読む。**未設定なら 503**（画面は「繋ぐ」導線を出さないこと）。
 * 🚨 「設定していないのに繋ごうとした」と「繋いだが失敗した」を区別できるようにしている。
 */
export async function driveOAuthConfig(request: Request): Promise<DriveOAuthConfig> {
  const settings = await getSettings();
  const clientId = settings.drive_client_id || undefined;
  if (!clientId) {
    throw new ApiError(
      503,
      "DRIVE_NOT_CONFIGURED",
      "Google ドライブのクライアント ID が設定されていません",
    );
  }
  const url = new URL(request.url);
  return { clientId, redirectUri: `${url.origin}/api/drive/callback` };
}
