import { requireActor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { requireAdmin } from "@/lib/admin/permissions-api";
import { errorResponse, ok } from "@/lib/schema/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:read");
    const rows = await db("directus_users")
      .select(
        "id",
        "first_name",
        "last_name",
        "email",
        "status",
        "role",
        "last_access",
        "provider",
        "external_identifier",
      )
      .orderBy("email");
    return ok({ data: rows });
  } catch (error) {
    return errorResponse(error);
  }
}
