import { requireActor } from "@/lib/auth/context";
import { csvBody } from "@/lib/items/csv";
import { listItems } from "@/lib/items/service";
import { errorResponse } from "@/lib/schema/api";

export const runtime = "nodejs";

const EXPORT_LIMIT = 1000;

type Context = {
  params: Promise<{ collection: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { collection } = await ctx.params;
    const url = new URL(request.url);
    const result = await listItems(actor, collection, {
      fields: url.searchParams.get("fields"),
      filter: url.searchParams.get("filter"),
      sort: url.searchParams.get("sort"),
      limit: String(EXPORT_LIMIT),
      offset: "0",
      meta: "filter_count",
      deep: url.searchParams.get("deep"),
    });
    const count = result.meta?.filter_count ?? result.data.length;
    if (count > EXPORT_LIMIT) {
      return Response.json(
        {
          error: {
            code: "EXPORT_LIMIT_EXCEEDED",
            message: `書き出しできるのは${EXPORT_LIMIT}件までです。条件を絞り込んでください`,
            limit: EXPORT_LIMIT,
            count,
          },
        },
        { status: 413 },
      );
    }

    const filename = `${collection}.csv`.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    const requestedColumns = (url.searchParams.get("fields") ?? "")
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
    return new Response(csvBody(result.data, requestedColumns), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
