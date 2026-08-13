import { NextResponse } from "next/server";
import { apiMessage, formString, redirectWithMessage } from "@/lib/admin/forms";
import { isInterfaceAllowedForType } from "@/lib/schema/interfaces";

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

  // 「編集のしかた」。空欄（自動）と、型に合わない指定は保存しない
  // （保存してしまうと、あとで型を見て解決するときに矛盾が残る）。
  const chosen = formString(formData, "interface");
  const meta = chosen && isInterfaceAllowedForType(chosen, type)
    ? { interface: chosen }
    : undefined;

  const response = await fetch(
    new URL(`/api/fields/${encodeURIComponent(collection)}`, request.url),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ field, type, schema, ...(meta ? { meta } : {}) }),
      cache: "no-store",
    },
  );

  const path = `/admin/collections/${encodeURIComponent(collection)}`;
  if (!response.ok) {
    return redirectWithMessage(request, path, "error", await apiMessage(response));
  }

  const url = new URL(path, request.url);
  url.searchParams.set("notice", "field_created");
  return NextResponse.redirect(url, { status: 303 });
}
