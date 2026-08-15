import { requireActor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { resolvePermission } from "@/lib/permissions/resolve";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type ActivityRow = {
  action: string;
  timestamp: Date | string;
  item: string;
  user: string | null;
  actor_type: string;
};

type ActivityEntry = {
  action: string;
  timestamp: string;
  item: string;
  user: string | null;
  actor_type: string;
};

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

/**
 * limit をクエリから安全な整数へ直す。既定 50・上限 200（design: panel-logs-history.md §3-2）。
 * 🚨 全件取得を書かない（AGENTS.md §4）。無効な値は既定へ倒す（一覧の表示を壊さない）。
 */
function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  const value = Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT;
  return Math.min(Math.max(value, 1), MAX_LIMIT);
}

/**
 * `GET /api/activity?collection=<name>&item=<id>`
 *
 * そのコレクション（+ 指定があれば item）の活動ログ（誰が・いつ・何をしたか）。
 *
 * 🚨 認可はサーバ側で行う（AGENTS.md §3.5）。「ログ・履歴」権限アクション ("log") で gate し、
 *    権限が無ければ 403 で拒否する（app 層のフィルタだけに頼らない。
 *    docs/design/panel-logs-history.md §3-2）。
 * 🚨 `ip` / `user_agent` はレスポンスに含めない（運用者専用の情報。同 §3-2）。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const url = new URL(request.url);

    const collection = url.searchParams.get("collection");
    if (!collection) {
      throw new ApiError(400, "INVALID_FIELD", "collection を指定してください");
    }
    const item = url.searchParams.get("item");

    const resolution = await resolvePermission(actor, collection, "log");
    if (!resolution.allowed) {
      throw new ApiError(403, "FORBIDDEN", "活動ログを閲覧する権限がありません");
    }

    const limit = parseLimit(url.searchParams.get("limit"));

    // 🚨 既知の穴（security 2026-08-15 実測 / docs/design/panel-logs-history.md §4 フラグ5）:
    //    ここは collection 単位でしか絞らず、resolution.rowFilter を**適用していない**。
    //    行フィルタ付き "log" 権限では、読めないはずの item の活動まで返る
    //    （sec_probe_ プローブで実測: route=2件 / 正=1件 / leaked_item2=true）。
    //    現状は latent（directus_permissions=0 行＝フィルタ付き "log" が未配布なので漏洩は顕在化していない）。
    //    直すときは activity.item を対象コレクションの実テーブルへ結合し resolution.rowFilter を適用する
    //    （item READ と同じ強制。lib/items/filter）。司令塔の a(文書化＋番人)/b(先回りで直す) 判断待ち。
    const query = db<ActivityRow>("directus_activity")
      .select("action", "timestamp", "item", "user", "actor_type")
      .where("collection", collection)
      .orderBy("timestamp", "desc")
      .limit(limit);
    if (item) query.andWhere("item", item);

    const rows = await query;
    const data: ActivityEntry[] = rows.map((row) => ({
      action: row.action,
      timestamp: toIso(row.timestamp),
      item: row.item,
      user: row.user,
      actor_type: row.actor_type,
    }));

    return ok({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
