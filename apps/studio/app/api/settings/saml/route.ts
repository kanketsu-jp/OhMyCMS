/**
 * SSO（SAML）の設定 API。**管理者だけ**。
 *
 * 🚨 ここが返すのは**すべて公開情報**（IdP の SSO URL / Entity ID / **公開鍵**である X.509 証明書）。
 *    秘密は 1 つも扱っていないので、画面へ渡してよい（`AGENTS.md §3.7`）。
 *    SP の秘密鍵を持つ日が来たら、**その値だけは絶対にここへ載せないこと**
 *    （「設定できているか」の真偽値だけを返す形にする）。
 */

import { requireAdmin } from "@/lib/admin/permissions-api";
import { requireActor } from "@/lib/auth/context";
import {
  getSamlConfig,
  isSamlUsable,
  parseIdpMetadata,
  updateSamlConfig,
  type SamlConfigInput,
} from "@/lib/auth/saml/config";
import { acsUrl, metadataUrl } from "@/lib/auth/saml/urls";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:read");

    const config = await getSamlConfig();
    return ok({
      data: {
        ...config,
        usable: isSamlUsable(config),
        // IdP の管理画面へ貼る値。画面で手打ちさせないために返す。
        sp: {
          entityId: config.spEntityId?.trim() || metadataUrl(request),
          acsUrl: acsUrl(request),
          metadataUrl: metadataUrl(request),
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request);
    await requireAdmin(actor, "settings:write");

    const body = await readJsonObject(request);
    const updatedBy = actor.type === "human" ? actor.userId : actor.onBehalfOf;

    // メタデータ XML が来たら、そこから3項目を読み取って設定に流し込む。
    const patch: SamlConfigInput = {};
    if (typeof body.metadata_xml === "string" && body.metadata_xml.trim()) {
      Object.assign(patch, parseIdpMetadata(body.metadata_xml));
    }

    if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
    if (body.idp_entity_id !== undefined) patch.idpEntityId = String(body.idp_entity_id ?? "");
    if (body.idp_sso_url !== undefined) patch.idpSsoUrl = String(body.idp_sso_url ?? "");
    if (body.sp_entity_id !== undefined) patch.spEntityId = String(body.sp_entity_id ?? "");
    if (Array.isArray(body.idp_certificates)) {
      patch.idpCertificates = body.idp_certificates.map((c) => String(c)).filter(Boolean);
    }

    const attributes = body.attributes;
    if (attributes && typeof attributes === "object") {
      const list = (value: unknown) =>
        Array.isArray(value)
          ? value.map((v) => String(v))
          : typeof value === "string"
            ? value.split(/[\n,]/)
            : undefined;
      const source = attributes as Record<string, unknown>;
      patch.attributes = {
        ...(list(source.email) ? { email: list(source.email) } : {}),
        ...(list(source.firstName) ? { firstName: list(source.firstName) } : {}),
        ...(list(source.lastName) ? { lastName: list(source.lastName) } : {}),
        ...(list(source.groups) ? { groups: list(source.groups) } : {}),
      };
    }

    const config = await updateSamlConfig(patch, updatedBy);
    return ok({
      data: {
        ...config,
        usable: isSamlUsable(config),
        sp: {
          entityId: config.spEntityId?.trim() || metadataUrl(request),
          acsUrl: acsUrl(request),
          metadataUrl: metadataUrl(request),
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
