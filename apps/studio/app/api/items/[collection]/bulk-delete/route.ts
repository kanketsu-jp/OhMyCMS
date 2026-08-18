import { requireActor } from "@/lib/auth/context";
import { deleteItem, type ActivityContext } from "@/lib/items/service";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError, isApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

/** 1件ごとに権限解決・行フィルタ・更新を行うため、応答が返る上限を既存のファイル一括削除と揃える。 */
const MAX_BULK_DELETE = 100;

type Context = {
  params: Promise<{ collection: string }>;
};

function activityContextFromRequest(request: Request): ActivityContext {
  return {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
    userAgent: request.headers.get("user-agent"),
  };
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { collection } = await ctx.params;
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids) && body.ids.every((id) => typeof id === "string")
      ? [...new Set(body.ids)]
      : null;

    if (!ids || ids.length === 0) {
      throw new ApiError(400, "INVALID_BODY", "削除するアイテムを指定してください");
    }
    if (ids.length > MAX_BULK_DELETE) {
      throw new ApiError(400, "TOO_MANY_ITEMS", "一度に削除できる件数を超えています");
    }

    const context = activityContextFromRequest(request);
    const deleted: string[] = [];
    const failed: { id: string; code: string }[] = [];

    for (const id of ids) {
      try {
        await deleteItem(actor, collection, id, context);
        deleted.push(id);
      } catch (error) {
        failed.push({ id, code: isApiError(error) ? error.code : "OTHER" });
      }
    }

    return ok({ data: { deleted, failed, limit: MAX_BULK_DELETE } });
  } catch (error) {
    return errorResponse(error);
  }
}
