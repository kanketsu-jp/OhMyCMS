import { NextResponse } from "next/server";
import { apiErrorKey, formString, redirectWithMessage } from "@/lib/admin/forms";
import { internalOrigin, publicBaseUrl } from "@/lib/auth/urls";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string; field: string }>;
};

export async function POST(request: Request, ctx: Context) {
  const { collection, field } = await ctx.params;
  const formData = await request.formData();
  const ja = formString(formData, "name_ja");
  const en = formString(formData, "name_en");
  const translations: Record<string, string> = {};

  if (ja) translations.ja = ja;
  if (en) translations.en = en;

  const response = await fetch(
    new URL(
      `/api/fields/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`,
      internalOrigin(request),
    ),
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        meta: {
          translations: Object.keys(translations).length > 0 ? translations : null,
        },
      }),
      cache: "no-store",
    },
  );

  const path = `/admin/collections/${encodeURIComponent(collection)}`;
  if (!response.ok) {
    return redirectWithMessage(request, path, "error", await apiErrorKey(response));
  }

  return NextResponse.redirect(new URL(path, publicBaseUrl(request)), { status: 303 });
}
