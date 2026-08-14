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
  const kind = formString(formData, "kind");
  const field = formString(formData, "field");
  const relatedCollection = formString(formData, "related_collection");
  const relatedField = formString(formData, "related_field");
  const oneField = formString(formData, "one_field");
  const path = `/admin/collections/${encodeURIComponent(collection)}`;
  const t = await getT("relations");

  if (kind !== "m2o" && kind !== "o2m") {
    return redirectWithMessage(request, path, "error", "kind_invalid");
  }
  if (!relatedCollection) {
    return redirectWithMessage(request, path, "error", "related_collection_required");
  }
  if (kind === "m2o" && !field) {
    return redirectWithMessage(request, path, "error", "field_required");
  }
  if (kind === "o2m" && (!relatedField || !oneField)) {
    return redirectWithMessage(
      request,
      path,
      "error",
      t("error_o2m_fields_required"),
    );
  }

  const fieldCollection = kind === "m2o" ? collection : relatedCollection;
  const fieldName = kind === "m2o" ? field : relatedField;
  const fieldResponse = await fetch(
    new URL(`/api/fields/${encodeURIComponent(fieldCollection)}`, internalOrigin(request)),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        field: fieldName,
        type: "uuid",
        schema: { is_nullable: true },
      }),
      cache: "no-store",
    },
  );
  const fieldCreated = fieldResponse.ok;

  if (fieldResponse.status !== 409 && !fieldResponse.ok) {
    return redirectWithMessage(request, path, "error", await apiErrorKey(fieldResponse));
  }

  const relationBody = kind === "m2o"
    ? {
      many_collection: collection,
      many_field: field,
      one_collection: relatedCollection,
    }
    : {
      many_collection: relatedCollection,
      many_field: relatedField,
      one_collection: collection,
      one_field: oneField,
    };

  const relationResponse = await fetch(new URL("/api/relations", internalOrigin(request)), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(relationBody),
    cache: "no-store",
  });

  if (!relationResponse.ok) {
    // 🚨 API の生文言を URL に載せない（任意文言のなりすましになる）。鍵だけを渡す。
    return redirectWithMessage(
      request,
      path,
      "error",
      fieldCreated ? "relation_partial_failure" : await apiErrorKey(relationResponse),
    );
  }

  const url = new URL(path, publicBaseUrl(request));
  url.searchParams.set("notice", "relation_created");
  return NextResponse.redirect(url, { status: 303 });
}
