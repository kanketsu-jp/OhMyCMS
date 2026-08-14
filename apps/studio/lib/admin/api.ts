import { headers } from "next/headers";

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string; code?: string };

export type MeResult =
  | {
      type: "human";
      userId: string;
      email: string;
      role: string | null;
      picture: string | null;
      avatarEmoji: string | null;
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

function errorMessage(status: number, payload: ApiErrorPayload | null): string {
  const message = payload?.error?.message;
  if (message) return status === 403 ? `権限がありません: ${message}` : message;
  if (status === 403) return "権限がありません";
  if (status === 404) return "見つかりません";
  if (status === 401) return "認証が必要です";
  return `APIエラーが発生しました (${status})`;
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
      message: errorMessage(response.status, payload),
    };
  }

  return { ok: true, status: response.status, data: payload as T };
}

export async function currentUser(): Promise<ApiResult<MeResult>> {
  return apiFetch<MeResult>("/api/auth/me");
}
