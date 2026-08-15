import { isAvatarEmoji } from "@/lib/admin/avatar-emojis";
import { resolveActor } from "@/lib/auth/context";
import { setAvatarEmoji } from "@/lib/auth/profile";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { LOCAL_ADMIN_EMAIL } from "@/lib/settings/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) {
      throw new ApiError(401, "UNAUTHENTICATED", "認証が必要です");
    }

    return ok(actor);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * アバターの絵文字を、いま入っている本人だけ変えられる。
 *
 * 🚨 **判断は全部ここ（サーバ側）でする。** 画面の一覧で絞っているからといって
 * サーバが何でも受けると AGENTS.md §3.5 違反になる（権限はフィルタで隠すのでなく拒否する）。
 * 🚨 更新先は常に `actor.userId`。body に id を取らない（他人の id を受け取らない）。
 */
export async function PATCH(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) {
      throw new ApiError(401, "UNAUTHENTICATED", "認証が必要です");
    }
    // エージェント（機械）に個人のアバターは無い。
    if (actor.type !== "human") {
      throw new ApiError(403, "HUMAN_AUTH_REQUIRED", "人間のセッション認証が必要です");
    }
    // 起動用の内部ユーザーは画面に一切出さない決まり（lib/admin/user-label.ts）。
    // アバターを持たせる意味が無いので、変更も拒否する。
    if (actor.email === LOCAL_ADMIN_EMAIL) {
      throw new ApiError(403, "HUMAN_AUTH_REQUIRED", "人間のセッション認証が必要です");
    }

    const body = await readJsonObject(request);
    const avatarEmoji = body.avatarEmoji;
    if (avatarEmoji !== null && !isAvatarEmoji(avatarEmoji)) {
      throw new ApiError(400, "INVALID_AVATAR_EMOJI", "指定された絵文字は選べません");
    }

    await setAvatarEmoji(actor.userId, avatarEmoji);

    return ok({ avatarEmoji });
  } catch (error) {
    return errorResponse(error);
  }
}
