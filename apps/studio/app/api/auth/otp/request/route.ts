import { requestLoginCode } from "@/lib/auth/otp";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const email = body.email;
    if (typeof email !== "string" || email.trim() === "") {
      throw new ApiError(400, "INVALID_BODY", "メールアドレスを指定してください");
    }

    // 🚨 応答は常に 200。登録の有無・上限超過・送信の成否で変えない。
    //    変えると「そのアドレスは登録されているか」を外から判定できてしまう。
    try {
      await requestLoginCode(email);
    } catch {
      // DB の障害などはここに来る。**利用者へ理由を返さない**（応答を分けない）。
      console.error("[otp] 確認コードの発行に失敗しました");
    }

    // 🚨 常に200。登録の有無・上限超過・送信可否で応答を変えない（利用者を列挙できてしまうため）。
    return ok({ data: { requested: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
