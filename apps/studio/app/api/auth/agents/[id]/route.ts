import { requireHumanActor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { errorResponse } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

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
