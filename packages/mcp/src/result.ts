import { isOhMyCmsError } from "@ohmycms/sdk";

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/**
 * 成功した結果。`outputSchema` を付けたツールは `structuredContent` を返す約束なので、
 * 同じ中身を `content`（テキスト）にも入れておく（outputSchema を読まないクライアント向け）。
 */
export function ok(structured: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

/**
 * API が返したエラーをそのままツールのエラーとして返す。
 *
 * 🚨 **MCP 側で権限を判断しない。** 403 / 404 は API が出した結論をそのまま伝える
 * （MCP が独自に隠すと権限が二重実装になり、必ず片方が腐る）。
 * 🚨 **トークンを絶対に含めない。** 例外に載っている URL とステータスだけを出す。
 */
export function fail(error: unknown): ToolResult {
  if (isOhMyCmsError(error)) {
    const payload = {
      error: {
        code: error.code,
        message: error.message,
        status: error.status,
        // detail.url には認証情報が入らない（トークンはヘッダで送っている）
        request: `${error.detail.method} ${error.detail.url}`,
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
      isError: true,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const payload = { error: { code: "MCP_INTERNAL_ERROR", message, status: 0 } };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

/** ツールの本体を包む。例外を漏らさず、必ず ToolResult にする */
export async function run(
  handler: () => Promise<Record<string, unknown>>,
): Promise<ToolResult> {
  try {
    return ok(await handler());
  } catch (error) {
    return fail(error);
  }
}
