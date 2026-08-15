import { sessionCookieHeader, isSecureRequest } from "@/lib/auth/cookies";
import { authenticateWithPassword } from "@/lib/auth/password-login";
import { issueSession } from "@/lib/auth/sessions";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const email = body.email;
    const password = body.password;

    if (
      typeof email !== "string" ||
      email.trim() === "" ||
      typeof password !== "string" ||
      password === ""
    ) {
      throw new ApiError(
        400,
        "INVALID_BODY",
        "メールアドレスとパスワードを指定してください",
      );
    }

    const result = await authenticateWithPassword(email, password);
    if (!result.ok) {
      throw new ApiError(
        401,
        "AUTH_FAILED",
        "メールアドレスまたはパスワードが違います",
      );
    }

    const session = await issueSession(result.userId, request, "password");
    const response = ok({
      data: {
        type: "human",
        userId: result.userId,
        email: result.email,
        role: result.role,
      },
    });
    response.headers.append(
      "Set-Cookie",
      sessionCookieHeader(session.rawToken, session.maxAge, isSecureRequest(request)),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
