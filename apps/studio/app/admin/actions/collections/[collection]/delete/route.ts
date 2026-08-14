import { NextResponse } from "next/server";
import { apiMessage, redirectWithMessage } from "@/lib/admin/forms";
import { internalOrigin, publicBaseUrl } from "@/lib/auth/urls";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string }>;
};

export async function POST(request: Request, ctx: Context) {
  const { collection } = await ctx.params;
  const response = await fetch(
    new URL(`/api/collections/${encodeURIComponent(collection)}`, internalOrigin(request)),
    {
      method: "DELETE",
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return redirectWithMessage(
      request,
      `/admin/collections/${encodeURIComponent(collection)}`,
      "error",
      await apiMessage(response),
    );
  }

  const url = new URL("/admin/collections", publicBaseUrl(request));
  url.searchParams.set("notice", "collection_deleted");
  return NextResponse.redirect(url, { status: 303 });
}
