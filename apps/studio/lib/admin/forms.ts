import { NextResponse } from "next/server";
import { publicBaseUrl } from "@/lib/auth/urls";
import { errorKeyFromApiCode, type ErrorKey } from "@/i18n/error";

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export function redirectWithMessage(
  request: Request,
  path: string,
  key: "error" | "notice",
  message: string,
): Response {
  const url = new URL(path, publicBaseUrl(request));
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, { status: 303 });
}

export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * API の失敗を **辞書の鍵** に落とす。
 *
 * 🚨 `apiMessage()` と違い、**API が返した文言を URL へ載せない**。
 *    `?error=` は利用者が自由に書けるので、文言を載せる作りだと
 *    細工したリンクで任意の文章をアプリ公式のエラー枠に出せてしまう（2026-08-15 実測）。
 *    知らないコードは `unexpected` に落ちる（fail closed）。
 */
export async function apiErrorKey(response: Response): Promise<ErrorKey> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return errorKeyFromApiCode(payload?.error?.code);
}

/**
 * 🚨 **`?error=` へ渡さないこと。** これは API の生文言を返すので、
 *    URL 経由で画面に出すと任意文言のなりすましになる。
 *    リダイレクトで返す用途には `apiErrorKey()` を使う。
 */
export async function apiMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  return payload?.error?.message ?? `APIエラーが発生しました (${response.status})`;
}

export function sameOriginUrl(request: Request, path: string): URL {
  return new URL(path, publicBaseUrl(request));
}
