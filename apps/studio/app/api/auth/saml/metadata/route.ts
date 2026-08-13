/**
 * SP メタデータ（`/api/auth/saml/metadata`）。
 *
 * **利用者が IdP へ渡すもの**なので、
 * 🚨 **認証なしで返す**（IdP を設定する人はまだログインしていないことがある）。
 * 中身は SP 側の Entity ID と ACS URL だけで、**秘密は 1 つも含まない**（`AGENTS.md §3.7`）。
 * 🚨 SAML が未設定・無効でも返す（設定する**前に**要るものだから）。
 */

import { getSamlConfig } from "@/lib/auth/saml/config";
import { buildSpMetadata, spMetadataInput } from "@/lib/auth/saml/metadata";
import { acsUrl, metadataUrl } from "@/lib/auth/saml/urls";
import { errorResponse } from "@/lib/schema/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const config = await getSamlConfig();
    const xml = buildSpMetadata(
      spMetadataInput(config, {
        metadataUrl: metadataUrl(request),
        acsUrl: acsUrl(request),
      }),
    );

    return new Response(xml, {
      status: 200,
      headers: {
        // SAML メタデータの正式な MIME（OASIS Metadata 仕様 §2）。
        "content-type": "application/samlmetadata+xml; charset=utf-8",
        // 🚨 IdP 側の設定を変えた直後に古いものを掴ませない。
        "cache-control": "no-store",
        // XML をブラウザに解釈させない（`AGENTS.md §3.4` と同じ考え方）。
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
