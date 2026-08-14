import { requireActor } from "@/lib/auth/context";
import { createLabel, listLabels } from "@/lib/labels/service";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

export const runtime = "nodejs";

/**
 * ラベルの一覧。
 * 🚨 0 件でも 404 にしない（`{ data: [] }` を返す）。左サイドバーが
 *    「0 件なら見出しごと出さない」判断をするため（shell との取り決め）。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    return ok({ data: await listLabels(actor) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    return ok({ data: await createLabel(actor, await readJsonObject(request)) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
