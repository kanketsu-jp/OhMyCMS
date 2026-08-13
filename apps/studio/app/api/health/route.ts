import { db } from "@/lib/db/knex";

export const runtime = "nodejs";

export async function GET() {
  try {
    await db.raw("SELECT 1");
    return Response.json({ status: "ok", db: "connected" }, { status: 200 });
  } catch (error) {
    // 🚨 このエンドポイントは**認証不要**なので、例外メッセージを返すと
    // 誰でも DB の接続先やホスト名を読める。詳細はログにだけ出す。
    // （knex の接続エラーは接続文字列を含むことがある）
    console.error("[health] DB への疎通に失敗:", error);
    return Response.json(
      { status: "error", db: "unavailable" },
      { status: 500 },
    );
  }
}
