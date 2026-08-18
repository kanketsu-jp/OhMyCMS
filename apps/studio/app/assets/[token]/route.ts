import { getPublicAsset } from "@/lib/files/service";
import { errorResponse } from "@/lib/schema/api";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, ctx: Context) {
  try {
    const { token } = await ctx.params;
    const url = new URL(request.url);
    const asset = await getPublicAsset(token, {
      width: url.searchParams.get("width"),
      height: url.searchParams.get("height"),
      fit: url.searchParams.get("fit"),
      format: url.searchParams.get("format"),
      quality: url.searchParams.get("quality"),
    });
    const headers = new Headers({
      "Cache-Control": "public, no-cache",
      "Content-Length": String(asset.contentLength),
      "Content-Type": asset.contentType,
      "X-Content-Type-Options": asset.contentTypeOptions,
    });
    if (asset.contentDisposition) headers.set("Content-Disposition", asset.contentDisposition);
    return new Response(new Uint8Array(asset.body), { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
