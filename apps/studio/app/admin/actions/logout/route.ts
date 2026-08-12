import { NextResponse } from "next/server";
import { apiMessage } from "@/lib/admin/forms";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = await fetch(new URL("/api/auth/logout", request.url), {
    method: "POST",
    headers: { cookie: request.headers.get("cookie") ?? "" },
    cache: "no-store",
  });

  if (!response.ok && response.status !== 204) {
    const url = new URL("/admin", request.url);
    url.searchParams.set("error", await apiMessage(response));
    return NextResponse.redirect(url, { status: 303 });
  }

  const redirect = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const cookie = response.headers.get("set-cookie");
  if (cookie) redirect.headers.set("set-cookie", cookie);
  return redirect;
}
