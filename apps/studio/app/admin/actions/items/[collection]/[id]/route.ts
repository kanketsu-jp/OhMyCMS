import { NextResponse } from "next/server";
import { apiMessage, redirectWithMessage } from "@/lib/admin/forms";
import { internalOrigin, publicBaseUrl } from "@/lib/auth/urls";
import { getT } from "@/i18n/server";
import type { Translator } from "@/i18n/translator";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string; id: string }>;
};

function parseItemPayload(formData: FormData, t: Translator): { data?: Record<string, unknown>; error?: string } {
  const payload: Record<string, unknown> = {};
  const fields = formData.getAll("__field").filter((value): value is string => typeof value === "string");

  for (const field of fields) {
    const type = formData.get(`__type:${field}`);
    const nullable = formData.get(`__nullable:${field}`) !== "false";
    const value = formData.get(`field:${field}`);

    if (type === "boolean") {
      payload[field] = formData.get(`field:${field}`) === "true";
      continue;
    }

    const raw = typeof value === "string" ? value : "";
    if (raw === "" && nullable && type !== "string") {
      payload[field] = null;
      continue;
    }
    if (raw === "" && type === "uuid") {
      continue;
    }

    if (type === "integer" || type === "float") {
      payload[field] = raw === "" ? null : Number(raw);
      continue;
    }
    if (type === "bigInteger" || type === "decimal") {
      payload[field] = raw === "" ? null : raw;
      continue;
    }
    if (type === "json") {
      if (raw === "" && nullable) {
        payload[field] = null;
        continue;
      }
      try {
        payload[field] = JSON.parse(raw);
      } catch {
        return { error: t("error_invalid_json_for_field", { field }) };
      }
      continue;
    }

    payload[field] = raw;
  }

  return { data: payload };
}

export async function POST(request: Request, ctx: Context) {
  const { collection, id } = await ctx.params;
  const t = await getT("items");
  const encoded = encodeURIComponent(collection);
  const encodedId = encodeURIComponent(id);
  const formData = await request.formData();
  const backPath = `/admin/content/${encoded}/${encodedId}`;

  if (formData.get("_method") === "delete") {
    const response = await fetch(new URL(`/api/items/${encoded}/${encodedId}`, internalOrigin(request)), {
      method: "DELETE",
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });

    if (!response.ok && response.status !== 204) {
      return redirectWithMessage(request, `/admin/content/${encoded}`, "error", await apiMessage(response));
    }

    const url = new URL(`/admin/content/${encoded}`, publicBaseUrl(request));
    url.searchParams.set("notice", "item_deleted");
    return NextResponse.redirect(url, { status: 303 });
  }

  const parsed = parseItemPayload(formData, t);
  if (parsed.error || !parsed.data) {
    return redirectWithMessage(request, backPath, "error", parsed.error ?? t("error_invalid_input"));
  }

  const response = await fetch(new URL(`/api/items/${encoded}/${encodedId}`, internalOrigin(request)), {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(parsed.data),
    cache: "no-store",
  });

  if (!response.ok) {
    return redirectWithMessage(request, backPath, "error", await apiMessage(response));
  }

  const url = new URL(backPath, publicBaseUrl(request));
  url.searchParams.set("notice", "item_saved");
  return NextResponse.redirect(url, { status: 303 });
}
