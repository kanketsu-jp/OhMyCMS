import { db } from "@/lib/db/knex";

export const runtime = "nodejs";

export async function GET() {
  try {
    await db.raw("SELECT 1");
    return Response.json({ status: "ok", db: "connected" }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { status: "error", message },
      { status: 500 },
    );
  }
}
