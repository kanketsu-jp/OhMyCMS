import { timingSafeEqual } from "node:crypto";
import { deriveBase64Url } from "@/lib/config/derive";
import { db } from "@/lib/db/knex";
import { ApiError } from "@/lib/schema/errors";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { purgeExpiredFiles } from "@/lib/trash/purge-files";

export const runtime = "nodejs";

function requirePurgeToken(request: Request): void {
  const expected =
    process.env.OHMYCMS_TRASH_PURGE_TOKEN?.trim() || deriveBase64Url("trash-purge-token");
  if (!expected) {
    throw new ApiError(503, "PURGE_TOKEN_NOT_CONFIGURED", "掃除用の認証鍵が設定されていません");
  }

  const actual = request.headers.get("x-ohmycms-purge-token") ?? "";
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(actual, "utf8");
  const valid =
    expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
  if (!valid) {
    throw new ApiError(401, "INVALID_PURGE_TOKEN", "掃除用の認証鍵が無効です");
  }
}

export async function POST(request: Request) {
  try {
    requirePurgeToken(request);
    const body = await readJsonObject(request);
    const dryRun = body.dry_run === true;
    const result = await purgeExpiredFiles(db, undefined, { dryRun });

    if (!dryRun) {
      await db("directus_activity").insert({
        action: "purge",
        user: null,
        actor_type: "system",
        actor_id: null,
        collection: "directus_files", // 直接読む理由: 監査ログの対象コレクションを固定するシステム処理。 / 記録 2026-08-18 / 決める人: 司令塔 / 決定済み
        item: "expired-files",
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
        user_agent: request.headers.get("user-agent"),
        comment: JSON.stringify({
          candidates: result.candidates,
          deleted: result.deleted.length,
          missing_objects: result.missingObjects.length,
          failed: result.failed.length,
        }),
        via_tool: "trash-purge-endpoint",
      });
    }

    return ok({ dry_run: dryRun, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
