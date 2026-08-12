import { NextResponse } from "next/server";

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

export function redirectWithMessage(
  request: Request,
  path: string,
  key: "error" | "notice",
  message: string,
): Response {
  const url = new URL(path, request.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, { status: 303 });
}

export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function apiMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  return payload?.error?.message ?? `APIエラーが発生しました (${response.status})`;
}

export function sameOriginUrl(request: Request, path: string): URL {
  return new URL(path, request.url);
}
