import { verifyLoginCode } from "@/lib/auth/otp";
import { sessionCookieHeader, isSecureRequest } from "@/lib/auth/cookies";
import { issueSession } from "@/lib/auth/sessions";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const email = body.email;
    const code = body.code;
    if (
      typeof email !== "string" ||
      email.trim() === "" ||
      typeof code !== "string" ||
      code.trim() === ""
    ) {
      throw new ApiError(400, "INVALID_BODY", "メールアドレスと確認コードを指定してください");
    }

    const result = await verifyLoginCode(email, code);
    if (!result) {
      // 🚨 理由を問わず1種類。期限切れ・試行回数超過・不一致を区別しない。
      throw new ApiError(401, "AUTH_FAILED", "確認コードが正しくありません");
    }

    const session = await issueSession(result.userId, request, "otp");
    const response = ok({ data: { type: "human", userId: result.userId, role: null } });
    response.headers.append("Set-Cookie", sessionCookieHeader(session.rawToken, session.maxAge, isSecureRequest(request)));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
