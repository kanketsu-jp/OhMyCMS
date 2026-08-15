import { isAvatarEmoji } from "@/lib/admin/avatar-emojis";
import { resolveActor } from "@/lib/auth/context";
import { setAvatarEmoji } from "@/lib/auth/profile";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

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
    // 🚨 ここに `actor.email === LOCAL_ADMIN_EMAIL` の拒否を置いていた。**本番で堀池さんが
    //    アイコンを変えられなくなった**（2026-08-15・実測で 403 を再現してから外した）。
    //    誤りは「**画面に出さない = その利用者は実在しない**」と読み替えたこと。
    //    `lib/settings/service.ts` の「利用者には一切見せない」は**メールアドレスを表示するな**
    //    という意味で、**その人が使っていない**という意味ではない。初期設定で作られる唯一の人間
    //    なので、**実際に操作しているのはこの行の人**。アバターを持ってよい。
    //    メールを画面に出さない規律は `lib/admin/user-label.ts` 側でそのまま守られる。

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
