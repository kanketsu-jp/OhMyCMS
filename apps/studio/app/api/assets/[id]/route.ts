import { requireActor } from "@/lib/auth/context";
import { getAsset } from "@/lib/files/service";
import { errorResponse } from "@/lib/schema/api";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const asset = await getAsset(actor, id, {
      width: url.searchParams.get("width"),
      height: url.searchParams.get("height"),
      fit: url.searchParams.get("fit"),
      format: url.searchParams.get("format"),
      quality: url.searchParams.get("quality"),
    });
    const headers = new Headers({
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(asset.contentLength),
      "Content-Type": asset.contentType,
    });
    if (asset.contentDisposition) {
      headers.set("Content-Disposition", asset.contentDisposition);
    }
    return new Response(new Uint8Array(asset.body), { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
