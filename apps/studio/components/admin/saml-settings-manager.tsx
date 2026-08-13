"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useFormat, useT } from "@/i18n/client";

/**
 * SSO（SAML）の設定。
 *
 * 🚨 面の作り方は `.claude/design-perf-charter.md` §3c の決めに従う:
 *    **Coinbase 型（面ゼロ）。1ページを Divider で区切る。カードで区切らない。**
 *    手本にした Anthropic / WorkOS の画面はカードだが、**堀池が見ているのはモバイル**で
 *    横幅が狭く、カードを剥がす作業は 2026-08-13 に丸一日かけた当のものなので繰り返さない。
 *
 * 🚨 §3c から取り入れたもの:
 *    **未入力なら確定ボタンを無効にする**（`opacity` で薄くするのでなく `disabled`）。
 *
 * 🚨 ここに出る値は**すべて公開情報**（IdP の SSO URL / Entity ID / 公開鍵の証明書）。
 *    秘密は 1 つも渡っていない（`AGENTS.md §3.7`）。
 */

export type SamlSettings = {
  enabled: boolean;
  idpEntityId: string | null;
  idpSsoUrl: string | null;
  idpCertificates: string[];
  spEntityId: string | null;
  attributes: { email: string[]; firstName: string[]; lastName: string[]; groups: string[] };
  updatedAt: string | null;
  usable: boolean;
  sp: { entityId: string; acsUrl: string; metadataUrl: string };
};

type EntryMode = "metadata" | "manual";

export function SamlSettingsManager({ settings }: { settings: SamlSettings }) {
  const t = useT("sso");
  const format = useFormat();
  const router = useRouter();

  const [mode, setMode] = useState<EntryMode>(settings.idpSsoUrl ? "manual" : "metadata");
  const [metadataXml, setMetadataXml] = useState("");
  const [entityId, setEntityId] = useState(settings.idpEntityId ?? "");
  const [ssoUrl, setSsoUrl] = useState(settings.idpSsoUrl ?? "");
  const [certificate, setCertificate] = useState(settings.idpCertificates[0] ?? "");
  const [enabled, setEnabled] = useState(settings.enabled);
  const [attributes, setAttributes] = useState({
    email: settings.attributes.email.join("\n"),
    firstName: settings.attributes.firstName.join("\n"),
    lastName: settings.attributes.lastName.join("\n"),
    groups: settings.attributes.groups.join("\n"),
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🚨 §3c「未入力なら確定を無効にする」。
  //    どちらの入力方法を選んでいるかで、何が揃っていれば足りるかが変わる。
  const ready =
    mode === "metadata" ? metadataXml.trim().length > 0 : Boolean(entityId && ssoUrl && certificate);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const body: Record<string, unknown> = {
      enabled,
      attributes: {
        email: attributes.email,
        firstName: attributes.firstName,
        lastName: attributes.lastName,
        groups: attributes.groups,
      },
    };
    if (mode === "metadata") {
      body.metadata_xml = metadataXml;
    } else {
      body.idp_entity_id = entityId;
      body.idp_sso_url = ssoUrl;
      body.idp_certificates = certificate ? [certificate] : [];
    }

    const response = await fetch("/api/settings/saml", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      const code = payload?.error?.code;
      if (response.status === 403) setError(t("error_forbidden"));
      else if (code === "SAML_INCOMPLETE") setError(t("error_incomplete"));
      else if (code === "INVALID_METADATA") setError(t("error_invalid_metadata"));
      else if (code === "INVALID_CERTIFICATE") setError(t("error_invalid_certificate"));
      else if (code === "INVALID_URL") setError(t("error_invalid_url"));
      else setError(payload?.error?.message ?? t("error_save_failed"));
      return;
    }

    setSaved(true);
    router.refresh();
  }

  const attributeField = (
    key: keyof typeof attributes,
    labelKey: string,
    helpKey?: string,
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`saml-attribute-${key}`}>{t(labelKey)}</Label>
      <Textarea
        id={`saml-attribute-${key}`}
        rows={2}
        value={attributes[key]}
        onChange={(event) => setAttributes({ ...attributes, [key]: event.target.value })}
      />
      {helpKey ? <p className="text-xs text-muted-foreground">{t(helpKey)}</p> : null}
    </div>
  );

  return (
    <form
      className="max-w-2xl space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {error ? (
        <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-muted-foreground">{t("saved")}</p> : null}

      {/* ── IdP に登録する値（利用者が IdP 側へ写す） ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t("sp_heading")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("sp_description")}</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="saml-sp-entity-id">{t("sp_entity_id_label")}</Label>
          <Input id="saml-sp-entity-id" readOnly value={settings.sp.entityId} />
          <p className="text-xs text-muted-foreground">{t("sp_entity_id_help")}</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="saml-acs-url">{t("acs_url_label")}</Label>
          <Input id="saml-acs-url" readOnly value={settings.sp.acsUrl} />
          <p className="text-xs text-muted-foreground">{t("acs_url_help")}</p>
        </div>

        <p className="text-xs">
          <a className="underline" href={settings.sp.metadataUrl}>
            {t("sp_metadata_link")}
          </a>
        </p>
      </section>

      <Separator />

      {/* ── IdP の設定（利用者が IdP 側から写してくる） ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("idp_heading")}</h2>

        {/* 🚨 §3c「2択を選ばせる」。ただしカードにはしない（面を増やさない）。 */}
        <div className="flex gap-4 text-sm">
          {(["metadata", "manual"] as EntryMode[]).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="saml-entry-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {t(value === "metadata" ? "entry_metadata" : "entry_manual")}
            </label>
          ))}
        </div>

        {mode === "metadata" ? (
          <div className="grid gap-2">
            <Label htmlFor="saml-metadata">{t("metadata_label")}</Label>
            <Textarea
              id="saml-metadata"
              rows={6}
              value={metadataXml}
              onChange={(event) => setMetadataXml(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("metadata_help")}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="saml-idp-entity-id">{t("idp_entity_id_label")}</Label>
              <Input
                id="saml-idp-entity-id"
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("idp_entity_id_help")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="saml-idp-sso-url">{t("idp_sso_url_label")}</Label>
              <Input
                id="saml-idp-sso-url"
                value={ssoUrl}
                onChange={(event) => setSsoUrl(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("idp_sso_url_help")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="saml-certificate">{t("certificate_label")}</Label>
              <Textarea
                id="saml-certificate"
                rows={5}
                value={certificate}
                onChange={(event) => setCertificate(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("certificate_help")}</p>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          {t("certificate_count")}: {settings.idpCertificates.length}
        </p>
      </section>

      <Separator />

      {/* ── 属性の対応づけ（🚨 NameID をメールに固定しないための要） ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t("attributes_heading")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("attributes_description")}</p>
        </div>
        {attributeField("email", "attribute_email_label", "attribute_email_help")}
        {attributeField("firstName", "attribute_first_name_label")}
        {attributeField("lastName", "attribute_last_name_label")}
        {attributeField("groups", "attribute_groups_label", "attribute_groups_help")}
      </section>

      <Separator />

      {/* ── 有効化（🚨 締め出さないことを画面で伝える） ── */}
      <section className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          {t("enable_label")}
        </label>
        <p className="text-xs text-muted-foreground">{t("enable_help")}</p>
        <p className="text-xs text-muted-foreground">{t("password_still_works")}</p>
      </section>

      <div className="flex items-center gap-3">
        {/* 🚨 §3c: 未入力なら確定できない。 */}
        <Button type="submit" disabled={saving || !ready}>
          {saving ? t("saving") : t("save_button")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("updated_at")}:{" "}
          {settings.updatedAt ? format.dateTime(new Date(settings.updatedAt)) : t("never_updated")}
        </span>
      </div>
    </form>
  );
}
