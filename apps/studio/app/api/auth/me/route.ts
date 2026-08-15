import { isAvatarEmoji } from "@/lib/admin/avatar-emojis";
import { resolveActor } from "@/lib/auth/context";
import { setAvatarEmoji, setProfileName } from "@/lib/auth/profile";
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

// directus_users.first_name / last_name の実際の列定義（migrations/20260804000200_create_directus_users.ts）。
// 🚨 いずれも `varchar(50)`。長い値を受けて DB 側で切られると「保存はできたのに違う値」になるので、
// アプリ側の上限も列に合わせる（64 にしない）。
const NAME_MAX_LENGTH = 50;

/**
 * `firstName` / `lastName` の1個ぶんを検証し、DB へ渡す形（保存する文字列 or 消す null）へ直す。
 *
 * 🚨 文字列でも null でもない値（数値・配列・オブジェクト等）は 400。
 * 🚨 trim() した長さが NAME_MAX_LENGTH を超えたら 400。
 * 🚨 null と、trim() した結果が空文字になったものは、どちらも「その名前を消す」= null。
 */
function normalizeName(value: unknown): string | null {
  if (value !== null && typeof value !== "string") {
    throw new ApiError(400, "INVALID_NAME", "名前は文字列で指定してください");
  }
  if (value === null) return null;

  const trimmed = value.trim();
  if (trimmed.length > NAME_MAX_LENGTH) {
    throw new ApiError(400, "INVALID_NAME", `名前は${NAME_MAX_LENGTH}文字までです`);
  }
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * 本人のプロフィール（アバターの絵文字・氏名）を、いま入っている本人だけ変えられる。
 *
 * 🚨 **判断は全部ここ（サーバ側）でする。** 画面の一覧で絞っているからといって
 * サーバが何でも受けると AGENTS.md §3.5 違反になる（権限はフィルタで隠すのでなく拒否する）。
 * 🚨 更新先は常に `actor.userId`。body に id を取らない（他人の id を受け取らない）。
 * 🚨 3つのキーは**すべて省略可**。**キーが無いものは触らない**（`undefined` と `null` を区別する）。
 *    `null` / 空文字は「その名前を消す」で、文字列はそのまま保存でなく trim() して保存する。
 */
export async function PATCH(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) {
      throw new ApiError(401, "UNAUTHENTICATED", "認証が必要です");
    }
    // エージェント（機械）に個人のアバターや氏名は無い。
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
    const hasAvatarEmoji = "avatarEmoji" in body;
    const hasFirstName = "firstName" in body;
    const hasLastName = "lastName" in body;

    // 何も指定しない更新は受けない（意味の無い呼び出しをサーバで拒否する）。
    if (!hasAvatarEmoji && !hasFirstName && !hasLastName) {
      throw new ApiError(400, "INVALID_BODY", "更新する項目を指定してください");
    }

    let avatarEmoji = actor.avatarEmoji;
    if (hasAvatarEmoji) {
      const value = body.avatarEmoji;
      if (value !== null && !isAvatarEmoji(value)) {
        throw new ApiError(400, "INVALID_AVATAR_EMOJI", "指定された絵文字は選べません");
      }
      avatarEmoji = value;
      await setAvatarEmoji(actor.userId, avatarEmoji);
    }

    let firstName = actor.firstName;
    let lastName = actor.lastName;
    if (hasFirstName || hasLastName) {
      const nameFields: { firstName?: string | null; lastName?: string | null } = {};
      if (hasFirstName) {
        firstName = normalizeName(body.firstName);
        nameFields.firstName = firstName;
      }
      if (hasLastName) {
        lastName = normalizeName(body.lastName);
        nameFields.lastName = lastName;
      }
      await setProfileName(actor.userId, nameFields);
    }

    // 🚨 返すのは更新後の3つだけ。auth_data やメールなど、他の列は返さない。
    return ok({ avatarEmoji, firstName, lastName });
  } catch (error) {
    return errorResponse(error);
  }
}
