import { requireActor } from "@/lib/auth/context";
import { requireAdmin } from "@/lib/admin/permissions-api";
import { errorResponse, ok } from "@/lib/schema/api";
import { getStorageStatus } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * いまの保管先の状態を返す（D5・右サイドバーの「概要」が読む）。
 *
 * 🚨 **返すのは `StorageStatus` の 5 項目だけ。** アクセスキーは伏せ字でも返さない
 *    （`lib/storage/index.ts` の型と、そこに書いてある 2 つの守り手が根拠）。
 *
 * 🚨 **権限はサーバで拒否する**（AGENTS.md §3.5）。保管先の設定は管理者の情報なので、
 *    画面で隠すのではなく、ここで `requireAdmin` を通す（`/api/settings` と同じ形）。
 *    ＝ 権限が無ければ 403 になり、右サイドバーは節を出さない。
 *
 * 🚨 **設定を変える口はここに作らない**（読むだけ）。変更は `/api/settings` が持つ。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:read");
    return ok({ data: await getStorageStatus() });
  } catch (error) {
    return errorResponse(error);
  }
}
