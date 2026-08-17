import { NextResponse } from "next/server";
import { publicBaseUrl } from "@/lib/auth/urls";
import { FALLBACK_ERROR_KEY, errorKeyFromPayload, type ErrorKey } from "@/i18n/error";

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
  // 🚨 **取り出しを自分で書かない。** `payload?.error?.code` を各所で書くと、
  //    形が変わったとき**何箇所直すのか誰も知らない**（実測 2026-08-17: 同じ取り出しが 7 箇所）。
  //    ここは Response を受ける層なので、**寄せ先へ渡して、表に無い code だけ既定へ落とす**。
  //    `errorKeyFromPayload` は表に無ければ `null` を返す（呼び出し側の具体的な文言のため）が、
  //    この関数は「必ず鍵を返す」約束なので、ここで `FALLBACK_ERROR_KEY` にする。
  return errorKeyFromPayload(await response.json().catch(() => null)) ?? FALLBACK_ERROR_KEY;
}

export function sameOriginUrl(request: Request, path: string): URL {
  return new URL(path, publicBaseUrl(request));
}
