import { NextResponse } from "next/server";
import { apiErrorKey } from "@/lib/admin/forms";
import { internalOrigin, publicBaseUrl } from "@/lib/auth/urls";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = await fetch(new URL("/api/auth/logout", internalOrigin(request)), {
    method: "POST",
    headers: { cookie: request.headers.get("cookie") ?? "" },
    cache: "no-store",
  });

  if (!response.ok && response.status !== 204) {
    const url = new URL("/admin", publicBaseUrl(request));
    url.searchParams.set("error", await apiErrorKey(response));
    return NextResponse.redirect(url, { status: 303 });
  }

  const redirect = NextResponse.redirect(new URL("/login", publicBaseUrl(request)), { status: 303 });
  const cookie = response.headers.get("set-cookie");
  if (cookie) redirect.headers.set("set-cookie", cookie);
  return redirect;
}
