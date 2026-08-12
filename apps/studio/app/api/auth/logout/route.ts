import { deleteCookieHeader, parseCookies, SESSION_COOKIE } from "@/lib/auth/cookies";
import { sha256Hex } from "@/lib/auth/crypto";
import { db } from "@/lib/db/knex";
import { errorResponse } from "@/lib/schema/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const token = parseCookies(request.headers.get("cookie")).get(SESSION_COOKIE);
    if (token) {
      await db("directus_sessions").where("token", sha256Hex(token)).delete();
    }

    const response = new Response(null, { status: 204 });
    response.headers.append("Set-Cookie", deleteCookieHeader(SESSION_COOKIE));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
