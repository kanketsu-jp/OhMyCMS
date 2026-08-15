/**
 * SAML(SSO) の許可リスト API（一覧 GET / 追加 POST）。
 *
 * 🚨 いま表が空だと IdP を設定した瞬間に誰も入れなくなる（切り替えの谷）。
 * それを避けるための「足す手段」がこの POST（`docs/design/sso-only-switchover.md`）。
 */

import { requireActor } from "@/lib/auth/context";
import { addAllowedEmail, listAllowedEmails } from "@/lib/auth/saml/allowlist";
import { requireAdmin } from "@/lib/admin/permissions-api";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

/** URL のクエリから limit / offset を取り出す。値の検証は lib 側（parseListRange）が行う。 */
function range(url: URL) {
  return {
    limit: url.searchParams.get("limit"),
    offset: url.searchParams.get("offset"),
  };
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:read");
    const url = new URL(request.url);
    return ok({ data: await listAllowedEmails(range(url)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:write");
    return ok({ data: await addAllowedEmail(await readJsonObject(request)) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
