import { resolveActor } from "@/lib/auth/context";
import { getAsset } from "@/lib/files/service";
import { errorResponse } from "@/lib/schema/api";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await resolveActor(request);
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const asset = await getAsset(actor, id, {
      width: url.searchParams.get("width"),
      height: url.searchParams.get("height"),
      fit: url.searchParams.get("fit"),
      format: url.searchParams.get("format"),
      quality: url.searchParams.get("quality"),
      withoutEnlargement: url.searchParams.get("withoutEnlargement"),
    });
    const headers = new Headers({
      "Cache-Control": actor ? "private, max-age=3600" : "public, max-age=3600",
      "Content-Length": String(asset.contentLength),
      "Content-Type": asset.contentType,
      // ブラウザの MIME 推測を止める。Content-Disposition: attachment は
      // 「危険な MIME」に限って付くが、保存される MIME はクライアント申告と拡張子で決まるため、
      // SVG を image/png として保存させれば attachment を回避できる。nosniff がその抜け道を塞ぐ。
      // AGENTS.md §3.4 / 受入基準 #9
      "X-Content-Type-Options": asset.contentTypeOptions,
    });
    if (asset.contentDisposition) {
      headers.set("Content-Disposition", asset.contentDisposition);
    }
    return new Response(new Uint8Array(asset.body), { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
