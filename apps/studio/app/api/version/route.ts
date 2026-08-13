import { requireActor } from "@/lib/auth/context";
import { errorResponse, ok } from "@/lib/schema/api";
import { getVersionInfo } from "@/lib/version/service";

export const runtime = "nodejs";

/**
 * バージョン確認（F2 §2-H）。
 *
 * 🚨 `OHMYCMS_UPDATE_FEED_URL` が未設定なら、**外部へ一切通信しない**。
 *    lib/version/service.ts に既定URLの定数を置いていないので、
 *    「うっかり既定値で問い合わせる」が起こりようがない作りにしてある。
 *    （Directus のテレメトリ強制送信が自作の動機の1つ。決定ログ参照）
 *
 * ログインは要る（バージョンは攻撃者への情報にもなるので未認証には出さない）。
 */
export async function GET(request: Request) {
  try {
    await requireActor(request);
    return ok({ data: await getVersionInfo() });
  } catch (error) {
    return errorResponse(error);
  }
}
