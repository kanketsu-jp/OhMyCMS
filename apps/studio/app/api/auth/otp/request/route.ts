import { diagnoseLoginCodeRequest, requestLoginCode } from "@/lib/auth/otp";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { isOnboardingCompleted } from "@/lib/settings/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const email = body.email;
    if (typeof email !== "string" || email.trim() === "") {
      throw new ApiError(400, "INVALID_BODY", "メールアドレスを指定してください");
    }

    // 🚨 **初期設定が終わっていない間だけ、正直に理由を返す。**
    //
    //    理由: そのとき**本物のアドレスを持つ利用者は 1 人も居ない**
    //    （管理者は `LOCAL_ADMIN_EMAIL` という置き換え用の値）。
    //    ＝ **列挙できる対象がゼロ**なので、隠すものが無い。
    //    逆に黙ると、**記録すら作られないのに「送りました。届かないときはもう一度」と案内**して、
    //    利用者を来ないメールの前で待たせる（2026-08-16 実測: code の行 0 / HTTP 200）。
    //
    // 🚨 **経路は「状態」で分ける。要求の中身（flag 等）で分けない。**
    //    呼び出し側が指定できる形にすると、**攻撃者がそれを立てて列挙器にできる**。
    //
    // 🚨 初期設定が完了した瞬間、**自動で黙る側へ戻る**（下の分岐がそのまま切り替わる）。
    //    「同じ設計が、場面によって守りにも害にもなる」——ここを揃えに来ないこと。
    if (!(await isOnboardingCompleted())) {
      const diagnosis = await diagnoseLoginCodeRequest(email);
      return ok({ data: { requested: diagnosis === "sent", diagnosis } });
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
