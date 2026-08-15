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
 * **API が返した文言を URL へ載せない。** 載せるのは **code** だけで、
 * 知らないコードは `unexpected` に落ちる（fail closed）。
 *
 * 🚨 **かつて `apiMessage()`（API の生文言をそのまま返す関数）がここにあった。
 *    2026-08-15 に削除した。** `?error=` は利用者が自由に書けるので、
 *    生文言を載せる作りだと **細工したリンクで任意の文章を
 *    「アプリが出した公式のエラー」として画面に出せる**（なりすまし）。
 *    削除時点で呼び出しは 0 件だったが、**残すと次の人が「便利な関数」として使う**。
 *    🚨 **無いから作ろう、としないこと。** 生文言が要る場面は、
 *    まず「その文言を誰が読むのか」を決めてから相談する。
 *    決定: `knowledge/decisions/i18n-check-scope-is-what-reaches-the-screen.md`
 *    見張り: `scripts/check-no-api-message.mjs`
 */
export async function apiErrorKey(response: Response): Promise<ErrorKey> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return errorKeyFromApiCode(payload?.error?.code);
}

export function sameOriginUrl(request: Request, path: string): URL {
  return new URL(path, publicBaseUrl(request));
}
