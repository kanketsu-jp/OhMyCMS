import { NextResponse } from "next/server";
import { apiMessage, formString, redirectWithMessage } from "@/lib/admin/forms";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string }>;
};

export async function POST(request: Request, ctx: Context) {
  const { collection } = await ctx.params;
  const formData = await request.formData();
  const manyCollection = formString(formData, "many_collection");
  const manyField = formString(formData, "many_field");
  const path = `/admin/collections/${encodeURIComponent(collection)}`;

  if (!manyCollection || !manyField) {
    return redirectWithMessage(request, path, "error", "削除するリレーションを指定してください");
  }

  const response = await fetch(
    new URL(
      `/api/relations/${encodeURIComponent(manyCollection)}/${encodeURIComponent(manyField)}`,
      request.url,
    ),
    {
      method: "DELETE",
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return redirectWithMessage(request, path, "error", await apiMessage(response));
  }

  const url = new URL(path, request.url);
  url.searchParams.set("notice", "リレーションを削除しました");
  return NextResponse.redirect(url, { status: 303 });
}
