import { canDiagnoseSafely, diagnoseLoginCodeRequest, requestLoginCode } from "@/lib/auth/otp";
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

    // 🚨 **初期設定が終わっておらず、かつ利用者が 1 人も居ないときだけ、正直に理由を返す。**
    //
    //    なぜ正直にするか: 黙ると、**記録すら作られないのに「送りました。届かないときは
    //    もう一度」と案内**して、利用者を来ないメールの前で待たせる
    //    （2026-08-16 実測: HTTP 200 / `{"requested":true}` / code の行 0）。
    //
    // 🚨 **なぜ「利用者が 0 人」まで要るか（最初はこれが抜けていた）。**
    //    当初は「初期設定が未完了なら利用者は居ない」としていた。**誤りだった。**
    //    `google/callback` と `saml/acs` は `isOnboardingCompleted` を**見ていない**
    //    （auth 実測・参照 0 件）。設定は環境変数からも入るので、
    //    **初期設定を終えないまま SSO で利用者が生まれる**ことがありうる。
    //    その状態を作って測ったら、**居る人と居ない人で応答が分かれた ＝ 列挙できた**:
    //      居る人  → `{"diagnosis":"mail-not-configured"}` ／ 居ない人 → `{"diagnosis":"no-account"}`
    //    🚨 **利用者が 0 人なら、正直な応答は `no-account` しか返らない**（実測）。
    //    **返る値が 1 通りしか無いものは、区別に使えない。** それが安全の根拠。
    //
    // 🚨 **経路は「状態」で分ける。要求の中身（flag 等）で分けない。**
    //    呼び出し側が指定できる形にすると、**攻撃者がそれを立てて列挙器にできる**。
    //
    // 🚨 利用者が 1 人でも生まれた瞬間、**自動で黙る側へ戻る**（下の分岐がそのまま切り替わる）。
    //    「同じ設計が、場面によって守りにも害にもなる」——ここを揃えに来ないこと。
    if (!(await isOnboardingCompleted()) && (await canDiagnoseSafely())) {
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
