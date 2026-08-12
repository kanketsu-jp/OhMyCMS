import { resolveActor } from "@/lib/auth/context";
import { errorResponse, ok } from "@/lib/schema/api";
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
