import { requireHumanActor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

/**
 * エージェント 1 件。
 *
 * 🚨 **`token_hash` を返さない。** 鍵そのものは発行時の 1 回しか出さない設計で、
 *    ハッシュでも**外へ出す理由が無い**（出すと総当たりの的が 1 つ増える）。
 *    ＝ 一覧（`/api/auth/agents`）と**同じ列だけ**を返す。
 *
 * 🚨 **自分が発行したものだけ**（`on_behalf_of`）。DELETE と同じ絞り込みにしてある。
 *    ここを緩めると、**他人のエージェントの有効期限を覗ける**。
 *
 * 🚨 **失効済みも返す。** 「いつ失効したか」は見たい情報で、
 *    消えてしまうと **失効漏れに気づけない**（2026-08-17 に 8 体の失効漏れが出た）。
 */
export async function GET(request: Request, ctx: Context) {
  try {
    const actor = await requireHumanActor(request);
    const { id } = await ctx.params;
    const row = await db("agent_principals")
      .select(
        "id",
        "name",
        "on_behalf_of",
        "tenant_scope",
        "capabilities",
        "origin",
        "expires_at",
        "revoked_at",
        "created_at",
      )
      // 🚨 期限切れかどうかを **DB で判定して返す**。画面が `Date.now()` を読むと
      //    描くたびに答えが変わり、同じ入力から同じ画面が出ない。**時計は 1 つ**にする。
      .select(db.raw("(expires_at < now()) as is_expired"))
      .where("id", id)
      .where("on_behalf_of", actor.userId)
      .first();

    if (!row) {
      throw new ApiError(404, "AGENT_NOT_FOUND", "エージェントが見つかりません");
    }

    return ok({ data: row });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    const actor = await requireHumanActor(request);
    const { id } = await ctx.params;
    const [row] = await db("agent_principals")
      .where("id", id)
      .where("on_behalf_of", actor.userId)
      .whereNull("revoked_at")
      .update({ revoked_at: db.fn.now() })
      .returning("id");

    if (!row) {
      throw new ApiError(404, "AGENT_NOT_FOUND", "エージェントが見つかりません");
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
