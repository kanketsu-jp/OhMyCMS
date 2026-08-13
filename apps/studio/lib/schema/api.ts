import { ApiError, isApiError } from "./errors";

export function ok<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

export function errorResponse(error: unknown): Response {
  if (isApiError(error)) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  // 🚨 例外メッセージをクライアントへ返さない。
  // 例外文にはファイルパス・DB の接続先・内部の実装名が混ざる（AGENTS.md §3.7 と同じ考え方）。
  // ApiError は「こちらが意図して書いた文言」なので返してよいが、
  // 想定外の例外は**一般化した文言とコードだけ**を返し、詳細はサーバのログにとどめる。
  console.error("[api] 未処理の例外:", error);
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "サーバ内部でエラーが発生しました",
      },
    },
    { status: 500 },
  );
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("body must be an object");
    }
    return body as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_BODY", "JSONオブジェクトを指定してください");
  }
}
