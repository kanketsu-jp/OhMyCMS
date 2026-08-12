import { NextResponse } from "next/server";
import { apiMessage, formString, redirectWithMessage } from "@/lib/admin/forms";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const collection = formString(formData, "collection");
  const note = formString(formData, "note");

  const response = await fetch(new URL("/api/collections", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({
      collection,
      meta: note ? { note } : undefined,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return redirectWithMessage(request, "/admin/collections", "error", await apiMessage(response));
  }

  return NextResponse.redirect(new URL(`/admin/collections/${collection}`, request.url), {
    status: 303,
  });
}
