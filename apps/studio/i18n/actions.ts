"use server";

/**
 * ロケール切替の Server Action。
 * 既存 REST API は増やさない方針（契約 §2-1 は「追加のみ」だが、
 * 画面専用の操作を公開 API にする理由が無いため Server Action にしている）。
 */

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from "./config";

export async function setLocaleAction(formData: FormData): Promise<void> {
  const requested = formData.get("locale");
  // 未知の値は黙って無視する（Cookie に任意文字列を書かせない）。
  if (!isLocale(requested)) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, requested, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    // ロケールは秘密ではないが、読むのはサーバだけなので HttpOnly にしておく。
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // Next.js 16: Server Action からクライアントキャッシュを更新する正式な口。
  refresh();
}
