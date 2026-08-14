import { requireActor } from "@/lib/auth/context";
import { publicBaseUrl } from "@/lib/auth/urls";
import { errorResponse, ok } from "@/lib/schema/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireActor(request);
    return ok({ data: { url: publicBaseUrl(request) } });
  } catch (error) {
    return errorResponse(error);
  }
}
