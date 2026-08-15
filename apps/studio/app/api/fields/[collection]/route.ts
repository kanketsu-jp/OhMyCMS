import { requireActor } from "@/lib/auth/context";
import { requireAdminAccess } from "@/lib/permissions/resolve";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { createField, getCollection, listFields } from "@/lib/schema/service";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:read");
    const { collection } = await ctx.params;
    // 🚨 **「無い表」と「欄が 0 本の表」を同じ応答にしない**（2026-08-16）。
    //    それまでは存在しないコレクションでも **200 / 空配列**を返しており、
    //    呼んだ側は **「取りに行けなかった」と「まだ欄が無い」を区別できなかった**
    //    （`/api/collections/<無い表>` は 404 を返すので、同じ API の中で答えが 2 通りあった）。
    //    実測: `information_schema` に聞くと **列が 0 本の表は 0 件**——
    //    つまり 200/0 件は**「無い表」でしか起きない**。404 にしても失うものが無い。
    if ((await getCollection(collection)) === null) {
      throw new ApiError(404, "COLLECTION_NOT_FOUND", "コレクションが見つかりません");
    }
    return ok(await listFields(collection));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    await requireAdminAccess(actor, "schema:write");
    const { collection } = await ctx.params;
    const body = await readJsonObject(request);
    return ok(await createField(collection, body));
  } catch (error) {
    return errorResponse(error);
  }
}
