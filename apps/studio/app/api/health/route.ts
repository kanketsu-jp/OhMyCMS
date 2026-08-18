import { db } from "@/lib/db/knex";
import { getBuildVersion } from "@/lib/version/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    await db.raw("SELECT 1");
    return Response.json(
      { status: "ok", db: "connected", version: getBuildVersion() },
      { status: 200 },
    );
  } catch (error) {
    // 🚨 このエンドポイントは**認証不要**なので、例外メッセージを返すと
    // 誰でも DB の接続先やホスト名を読める。詳細はログにだけ出す。
    // （knex の接続エラーは接続文字列を含むことがある）
    const code =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? /^(?:E[A-Z]+|[0-9A-Z]{5})$/.exec(error.code)?.[0] ?? "UNKNOWN"
        : "UNKNOWN";
    console.error("[health] DB への疎通に失敗", { code });
    return Response.json(
      { status: "error", db: "unavailable" },
      { status: 500 },
    );
  }
}
