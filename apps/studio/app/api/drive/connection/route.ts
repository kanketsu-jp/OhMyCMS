import { requireActor } from "@/lib/auth/context";
import { connectionStatus, disconnect } from "@/lib/drive/tokens";
import { errorResponse, ok } from "@/lib/schema/api";

export const runtime = "nodejs";

function userIdOf(actor: Awaited<ReturnType<typeof requireActor>>): string {
  return actor.type === "human" ? actor.userId : actor.onBehalfOf;
}

/**
 * 繋がっているかどうか。
 * 🚨 返すのは **繋がっているか** と **繋いだアカウントのメール**だけ。
 *    トークンは絶対に載せない（lib/drive/tokens.ts が外へ出さない作りになっている）。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    return ok({ data: await connectionStatus(userIdOf(actor)) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** 切断。保存してあるリフレッシュトークンを消す。 */
export async function DELETE(request: Request) {
  try {
    const actor = await requireActor(request);
    await disconnect(userIdOf(actor));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
