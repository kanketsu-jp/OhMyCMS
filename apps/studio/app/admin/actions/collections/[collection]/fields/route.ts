import { NextResponse } from "next/server";
import { apiErrorKey, formString, redirectWithMessage } from "@/lib/admin/forms";
import { internalOrigin, publicBaseUrl } from "@/lib/auth/urls";

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

  // 「編集のしかた」。空欄（自動）だけ保存しない。型との整合性は API 側で拒否する。
  const chosen = formString(formData, "interface");
  const meta = chosen ? { interface: chosen } : undefined;

  const response = await fetch(
    new URL(`/api/fields/${encodeURIComponent(collection)}`, internalOrigin(request)),
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
  const formPath = `${path}/fields/new`;
  if (!response.ok) {
    return redirectWithMessage(request, formPath, "error", await apiErrorKey(response));
  }

  const url = new URL(path, publicBaseUrl(request));
  url.searchParams.set("notice", "field_created");
  return NextResponse.redirect(url, { status: 303 });
}
