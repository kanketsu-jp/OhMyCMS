import { NextResponse } from "next/server";
import { apiErrorKey, formString, redirectWithMessage } from "@/lib/admin/forms";
import { internalOrigin, publicBaseUrl } from "@/lib/auth/urls";
import { getT } from "@/i18n/server";

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
  const t = await getT("relations");

  if (!manyCollection || !manyField) {
    return redirectWithMessage(request, path, "error", "delete_target_required");
  }

  const response = await fetch(
    new URL(
      `/api/relations/${encodeURIComponent(manyCollection)}/${encodeURIComponent(manyField)}`,
      internalOrigin(request),
    ),
    {
      method: "DELETE",
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return redirectWithMessage(request, path, "error", await apiErrorKey(response));
  }

  const url = new URL(path, publicBaseUrl(request));
  url.searchParams.set("notice", "relation_deleted");
  return NextResponse.redirect(url, { status: 303 });
}
