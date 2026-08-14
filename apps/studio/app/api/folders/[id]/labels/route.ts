import { requireActor } from "@/lib/auth/context";
import { labelsForTarget, setLabelsForTarget } from "@/lib/labels/service";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    return ok({ data: await labelsForTarget(actor, "folder", id) });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * 付いているラベルを**丸ごと置き換える**（差分ではない）。
 * 画面が持っている「いま付いている一覧」をそのまま送る想定。
 */
export async function PUT(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    const body = await readJsonObject(request);
    return ok({ data: await setLabelsForTarget(actor, "folder", id, body.labelIds) });
  } catch (error) {
    return errorResponse(error);
  }
}
