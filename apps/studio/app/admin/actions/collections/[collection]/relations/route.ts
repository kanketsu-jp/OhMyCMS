import { NextResponse } from "next/server";
import { apiMessage, formString, redirectWithMessage } from "@/lib/admin/forms";

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

  if (kind !== "m2o" && kind !== "o2m") {
    return redirectWithMessage(request, path, "error", "リレーションの種類が不正です");
  }
  if (!relatedCollection) {
    return redirectWithMessage(request, path, "error", "相手コレクションを入力してください");
  }
  if (kind === "m2o" && !field) {
    return redirectWithMessage(request, path, "error", "フィールド名を入力してください");
  }
  if (kind === "o2m" && (!relatedField || !oneField)) {
    return redirectWithMessage(
      request,
      path,
      "error",
      "相手のフィールド名とこのコレクションでの表示名を入力してください",
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
        ? `列は作成されましたがリレーションの作成に失敗しました: ${message}`
        : message,
    );
  }

  const url = new URL(path, request.url);
  url.searchParams.set("notice", "リレーションを追加しました");
  return NextResponse.redirect(url, { status: 303 });
}
