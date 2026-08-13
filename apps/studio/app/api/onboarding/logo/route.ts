import { requireAdmin } from "@/lib/admin/permissions-api";
import { parseCookies, SETUP_COOKIE } from "@/lib/auth/cookies";
import { requireActor } from "@/lib/auth/context";
import { isValidSetupSession } from "@/lib/auth/setup-session";
import { uploadFile } from "@/lib/files/service";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { isOnboardingCompleted } from "@/lib/settings/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (await isOnboardingCompleted()) {
      throw new ApiError(
        409,
        "ONBOARDING_ALREADY_COMPLETED",
        "初期設定は完了しています",
      );
    }

    const setupToken = parseCookies(request.headers.get("cookie")).get(SETUP_COOKIE) ?? null;
    const setupAuthorized = isValidSetupSession(setupToken);

    let actor = null;
    if (!setupAuthorized) {
      const resolvedActor = await requireActor(request);
      await requireAdmin(resolvedActor, "settings:write");
      actor = resolvedActor;
    }

    const formData = await request.formData();
    const value = formData.get("file");
    if (!(value instanceof File)) {
      throw new ApiError(400, "FILE_REQUIRED", "fileフィールドにファイルを指定してください");
    }
    if (!value.type.startsWith("image/")) {
      throw new ApiError(400, "INVALID_FILE_TYPE", "画像ファイルを指定してください");
    }

    const body = Buffer.from(await value.arrayBuffer());
    const row = await uploadFile(actor, {
      filename: value.name,
      contentType: value.type,
      body,
    });

    return ok({ data: { id: row.id } }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
