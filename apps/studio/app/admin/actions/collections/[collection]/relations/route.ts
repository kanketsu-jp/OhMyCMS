import { NextResponse } from "next/server";
import { apiMessage, formString, redirectWithMessage } from "@/lib/admin/forms";
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
    return redirectWithMessage(request, path, "error", t("error_invalid_kind"));
  }
  if (!relatedCollection) {
    return redirectWithMessage(request, path, "error", t("error_related_collection_required"));
  }
  if (kind === "m2o" && !field) {
    return redirectWithMessage(request, path, "error", t("error_field_required"));
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
    new URL(`/api/fields/${encodeURIComponent(fieldCollection)}`, request.url),
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
    return redirectWithMessage(request, path, "error", await apiMessage(fieldResponse));
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

  const relationResponse = await fetch(new URL("/api/relations", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(relationBody),
    cache: "no-store",
  });

  if (!relationResponse.ok) {
    const message = await apiMessage(relationResponse);
    return redirectWithMessage(
      request,
      path,
      "error",
      fieldCreated
        ? t("error_create_failed_after_field", { message })
        : message,
    );
  }

  const url = new URL(path, request.url);
  url.searchParams.set("notice", "relation_created");
  return NextResponse.redirect(url, { status: 303 });
}
