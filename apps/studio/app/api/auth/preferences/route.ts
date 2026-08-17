import { requireHumanActor } from "@/lib/auth/context";
import { getUserPreferences, setUserPreference } from "@/lib/auth/preferences";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

const PREFERENCE_KEY_MAX_LENGTH = 128;

function preferenceKey(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > PREFERENCE_KEY_MAX_LENGTH) {
    throw new ApiError(400, "INVALID_PREFERENCE_KEY", "設定キーが正しくありません");
  }
  return value;
}

/** 認証中の利用者自身の設定だけを返す。 */
export async function GET(request: Request) {
  try {
    const actor = await requireHumanActor(request);
    return ok({ data: await getUserPreferences(actor.userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** 認証中の利用者自身の設定だけを1件保存する。 */
export async function PATCH(request: Request) {
  try {
    const actor = await requireHumanActor(request);
    const body = await readJsonObject(request);
    if ("userId" in body && body.userId !== actor.userId) {
      throw new ApiError(403, "PREFERENCE_OWNER_REQUIRED", "自分の設定だけ変更できます");
    }
    const key = preferenceKey(body.key);
    if (!("value" in body)) {
      throw new ApiError(400, "INVALID_BODY", "設定値を指定してください");
    }

    await setUserPreference(actor.userId, key, body.value);
    return ok({ data: { key, value: body.value } });
  } catch (error) {
    return errorResponse(error);
  }
}
