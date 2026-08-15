import { headers } from "next/headers";

import { errorKeyFromApiCode, FALLBACK_ERROR_KEY, type ErrorKey } from "@/i18n/error";

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; messageKey: ErrorKey; code?: string };

export type MeResult =
  | {
      type: "human";
      userId: string;
      email: string;
      role: string | null;
      picture: string | null;
      avatarEmoji: string | null;
      firstName: string | null;
      lastName: string | null;
    }
  | { type: "agent"; agentId: string; name: string; onBehalfOf: string };

export async function requestOrigin(): Promise<string> {
  const incoming = await headers();
  const forwardedHost = incoming.get("x-forwarded-host");
  const forwardedProto = incoming.get("x-forwarded-proto");
  if (forwardedHost || forwardedProto) {
    return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
  }
  const host = incoming.get("host") ?? "localhost:3001";
  return `http://${host}`;
}

/**
 * 🚨 **文言を返さない。辞書の鍵だけを返す。**
 *
 * ここは `lib/` なので辞書を引く手段（`getT` / `useT`）を持てない
 * （持つとフレームワークに依存し、AGENTS.md 3.6 の分離が壊れる）。
 * **鍵まで**を担当し、**訳すのは画面側**にする。
 *
 * 🚨 以前はここが日本語を 4 件持ち、さらに API の生文言をそのまま返していた。
 *    `` `権限がありません: ${message}` `` は、その 2 つが 1 行に混ざっていた。
 *    実測 2026-08-16（saml）: **英語の画面**に
 *    「権限がありません: 管理者権限が必要です」がそのまま出ていた（`/admin/settings/sso`・
 *    権限の無い利用者・応答は 200）。
 *
 * status から鍵を補うのは、**API が code を返さなかったとき**だけ。
 */
function errorKeyFor(status: number, payload: ApiErrorPayload | null): ErrorKey {
  const code = payload?.error?.code;
  if (code) {
    const key = errorKeyFromApiCode(code);
    if (key !== FALLBACK_ERROR_KEY) return key;
  }
  if (status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 401) return "unauthenticated";
  return FALLBACK_ERROR_KEY;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const incoming = await headers();
  const origin = await requestOrigin();
  const response = await fetch(new URL(path, origin), {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.headers ?? {}),
      cookie: incoming.get("cookie") ?? "",
    },
  });

  if (response.status === 204) {
    return { ok: true, status: response.status, data: undefined as T };
  }

  const payload = await response.json().catch(() => null) as T & ApiErrorPayload | null;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: payload?.error?.code,
      messageKey: errorKeyFor(response.status, payload),
    };
  }

  return { ok: true, status: response.status, data: payload as T };
}

export async function currentUser(): Promise<ApiResult<MeResult>> {
  return apiFetch<MeResult>("/api/auth/me");
}
