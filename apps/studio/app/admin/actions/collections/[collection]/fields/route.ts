import { NextResponse } from "next/server";
import { apiMessage, formString, redirectWithMessage } from "@/lib/admin/forms";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string }>;
};

export async function POST(request: Request, ctx: Context) {
  const { collection } = await ctx.params;
  const formData = await request.formData();
  const field = formString(formData, "field");
  const type = formString(formData, "type");
  const maxLength = formString(formData, "max_length");
  const required = formData.get("required") === "true";
  const schema: Record<string, unknown> = { is_nullable: !required };

  if (type === "string" && maxLength) {
    schema.max_length = Number(maxLength);
  }

  const response = await fetch(
    new URL(`/api/fields/${encodeURIComponent(collection)}`, request.url),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ field, type, schema }),
      cache: "no-store",
    },
  );

  const path = `/admin/collections/${encodeURIComponent(collection)}`;
  if (!response.ok) {
    return redirectWithMessage(request, path, "error", await apiMessage(response));
  }

  const url = new URL(path, request.url);
  url.searchParams.set("notice", "フィールドを追加しました");
  return NextResponse.redirect(url, { status: 303 });
}
