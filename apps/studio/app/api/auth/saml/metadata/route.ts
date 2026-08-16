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
        //
        // 🚨 **`next.config.ts` の `headers()` が全応答に同じものを付けるようになった**
        //    （2026-08-17）。**それでもここは消さない。**
        //    ここは「既定に乗っている」のではなく、**XML を配る口として自前で決めている**もの。
        //    既定を将来外す人が、この口の判断まで一緒に落とさないため
        //    （`lib/files/service.ts` の自前 nosniff も同じ理由で残っている）。
        // 🟢 実測 2026-08-17: 自前と `headers()` で**二重にはならない**（応答は 1 行）。
        //
        // 🚨 **その代わり、この口では「既定が効いているか」を測れない**
        //    （**自前だけでも 1 行出る**ので、既定が外れても気づけない）。
        //    ＝ 既定の生死を見るなら、**自前を持たない口**で見ること。
        //      実測に使ったのは `saml/acs`（GET で 405 / 本文なし POST で 400。**どちらも書き込み 0**）。
        //      🚨 `saml/login` は使わないこと——**有効なとき `ohmycms_saml_requests` に 1 行書く**。
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
