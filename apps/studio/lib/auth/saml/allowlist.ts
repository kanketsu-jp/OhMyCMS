import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/knex";
import { asJsonObject } from "@/lib/auth/json-object";
import { ApiError, rethrowAsConflict } from "@/lib/schema/errors";
import { parseListRange, type ListRangeInput } from "@/lib/list-range";

/**
 * SAML(SSO) の許可リスト照合。
 *
 * 🚨 契約 `AGENTS.md §3.6`: `next/*` を import しない。
 *
 * `docs/design/sso-user-provisioning.md` §2 のとおり、
 * 照合は**小文字化した完全一致**でのみ行う。前方一致・ドメイン一致にはしない
 * (「@example.com なら全員」は別の機能。欲しければ改めて決める)。
 *
 * ─────────────────────────────────────────────────────────────
 * 🚨 **いま、この許可リストは GUI から 1 行も足せません。**（実測 2026-08-16）
 *
 *   API は在る … `app/api/settings/saml/allowed-emails/route.ts`（取得・追加）
 *                `app/api/settings/saml/allowed-emails/[id]/route.ts`（削除）
 *   🚨 画面は無い … その API を呼ぶ画面は **0 件**
 *                  🟢 対照: 同じ探し方で SSO 設定本体を呼ぶ画面は **3 件**
 *                          ＝「見ていない 0」ではない
 *   🚨 実データも **0 行**（一度も 1 行も入っていない）
 *
 * 何が起きるか:
 *   下の `isAllowedEmail` は **行が無ければ false** を返す。
 *   ＝ **SSO で入った人は全員「権限なし」**。
 *   ＝ 🚨 **SSO を有効にしても、実質的に使えません。**
 *   （「まだ使われていない」のではなく「**使えない**」です。区別してください。）
 *
 * なぜ画面を作っていないか:
 *   🚨 **282（人の識別子からメールを外す）が動いているため。**
 *   この表は **`email` 列で引く**（下の問い合わせ 3 箇所とも）。
 *   282 が「メールは連絡先であって識別子ではない」に決まると、
 *   **この表の鍵ごと変わり、画面も作り直し**になる。
 *   → **282 の結論を待ってから作る**、という判断（司令塔 2026-08-16）。
 *
 * 🚨 **待っている間ずっと SSO が使えない**ことは、判断ボードへ出してある。
 *   この注記は「知らないまま放置されている」のではないことを、次に読む人へ残すためのもの。
 * ─────────────────────────────────────────────────────────────
 */
export async function isAllowedEmail(email: string | null): Promise<boolean> {
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const row = await db("ohmycms_saml_allowed_emails").select("id").where({ email: normalized }).first();

  return row !== undefined;
}

/**
 * 許可判定の「理由」まで割った型。
 *
 * 🚨 `allowed` だけだと `false` の内訳（一覧に無い／そもそもメールが届いていない）が
 * 記録の上で区別できない(`docs/design/sso-user-provisioning.md` §1)。
 * `no_email` は**管理者が一覧に足しても直らない**（IdP の属性設定の話）。
 * `not_listed` は**足せば直る**。この2つを同じ `false` のまま記録すると、
 * 管理者は直らない方にも一覧を足し続けることになる。
 */
export type AllowlistReason = "allowed" | "not_listed" | "no_email";

export type AllowlistCheck = {
  allowed: boolean;
  reason: AllowlistReason;
  /** 実際に照合した値(小文字化後)。照合できなかった(no_email)ときは null。 */
  email: string | null;
};

/**
 * 許可リストと照合し、判定結果を理由つきで返す。
 *
 * 🚨 判定そのものは `isAllowedEmail` を呼んで行う(同じ判定を2箇所に書かない)。
 * ここで返す `email` は**照合に使った値そのもの**。`upsertSamlUser` が保存用に使う
 * `<uuid>@saml.invalid` のような埋め草は入れない(管理者が一覧に足せる値ではないため)。
 */
export async function checkAllowlist(email: string | null): Promise<AllowlistCheck> {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return { allowed: false, reason: "no_email", email: null };
  }

  const allowed = await isAllowedEmail(normalized);
  return allowed
    ? { allowed: true, reason: "allowed", email: normalized }
    : { allowed: false, reason: "not_listed", email: normalized };
}

export type AllowedEmailRow = {
  id: string;
  email: string;
  created_at: string;
};

/**
 * 許可リストの一覧を返す。
 *
 * 🚨 並び順は `created_at` の昇順（足した順）。管理者が「さっき足した行」を
 * 一番下から探せるようにするため（新しい順にすると毎回並びが変わって探しにくい）。
 */
export async function listAllowedEmails(range: ListRangeInput = {}): Promise<AllowedEmailRow[]> {
  const { limit, offset } = parseListRange(range);
  return db<AllowedEmailRow>("ohmycms_saml_allowed_emails")
    .select("id", "email", "created_at")
    .orderBy("created_at", "asc")
    .limit(limit)
    .offset(offset);
}

/**
 * 許可リストへ1件足す。
 *
 * 🚨 メールの正規表現は書かない。IdP が返す値が正であり、形で弾きすぎると
 * 実在するアドレスまで拒否してしまう（`AGENTS.md` の考え方と同じ）。
 * ここでは「文字列であること」「`@` を含むこと」だけを見る。
 */
export async function addAllowedEmail(body: Record<string, unknown>): Promise<AllowedEmailRow> {
  const raw = body.email;
  if (typeof raw !== "string") {
    throw new ApiError(400, "INVALID_EMAIL", "email は文字列で指定してください");
  }

  // 🚨 表の値は必ず小文字（isAllowedEmail は小文字化してから引くため、
  // 大文字混じりで保存すると永久に一致しない）。
  const email = raw.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new ApiError(400, "INVALID_EMAIL", "email の形式が正しくありません");
  }

  const existing = await db("ohmycms_saml_allowed_emails").select("id").where({ email }).first();
  if (existing) {
    // 🚨 黙って成功にしない。管理者が「足したつもり」で重複に気づけなくなる。
    throw new ApiError(409, "EMAIL_ALREADY_ALLOWED", "このメールアドレスはもう許可リストにあります");
  }

  try {
    // 🚨 id に既定値が無い列（uuid 主キー）なので、ここで生成して渡す
    // (`lib/auth/sessions.ts` / `app/api/auth/dev-login/route.ts` と同じ形)。
    const [row] = await db<AllowedEmailRow>("ohmycms_saml_allowed_emails")
      .insert({ id: randomUUID(), email })
      .returning("*");
    return row;
  } catch (error) {
    // 事前チェック(↑)は分かりやすいエラーのため、こちらは同時挿入の競合窓を塞ぐため。
    // 役割が違うので両方要る(unique_violation を 409 に翻訳)。
    rethrowAsConflict(error);
    throw error;
  }
}

/** 許可リストから1件消す。存在しなければ 404。 */
export async function deleteAllowedEmail(id: string): Promise<void> {
  const deleted = await db("ohmycms_saml_allowed_emails").where({ id }).delete();
  if (!deleted) {
    throw new ApiError(404, "ALLOWED_EMAIL_NOT_FOUND", "許可リストの行が見つかりません");
  }
}

/**
 * 許可リストの判定結果を `directus_users.auth_data` に記録する。
 *
 * 🚨 ここではポリシーの付与・剥奪を一切行わない。一覧に無い人を落とすのは
 * 認可の層(`requireAdminAccess` 等が既に 403 を投げる)であって、ここではない
 * (`docs/design/sso-user-provisioning.md` §1)。
 *
 * 記録する理由: 一覧に入れ忘れた人が来たとき、その人が誰か分かるようにするため。
 * 記録が無いと、管理者は誰を追加すべきか分からない(設計 §1 の3つ目の理由)。
 *
 * 🚨 `reason` / `email` も併せて記録する。**`allowed` から `reason` を導出しない**
 * (呼び出し元で `checkAllowlist` が判定済みの値をそのまま渡す)。理由まで残さないと、
 * 「一覧に足せば直る」と「足しても直らない」が後から区別できなくなる(上の由来と同じ)。
 */
export async function recordAllowlistCheck(userId: string, check: AllowlistCheck): Promise<void> {
  const existing = await db<{ id: string; auth_data: unknown }>("directus_users")
    .select("auth_data")
    .where("id", userId)
    .first();

  await db("directus_users")
    .where("id", userId)
    .update({
      auth_data: {
        ...asJsonObject(existing?.auth_data),
        saml_allowed: check.allowed,
        saml_allowed_reason: check.reason,
        saml_allowed_email: check.email,
        saml_allowed_checked_at: new Date().toISOString(),
      },
    });
}
