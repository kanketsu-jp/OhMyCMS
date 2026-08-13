import { ErrorBanner } from "@/components/admin/error-banner";
import { SamlSettingsManager, type SamlSettings } from "@/components/admin/saml-settings-manager";
import { apiFetch } from "@/lib/admin/api";
import { getT } from "@/i18n/server";

/**
 * SSO（SAML）の設定（V1-A）。
 * 設定は API 経由で取る（直接 DB を読むと権限チェックが2系統になって食い違う。
 * `settings/general/page.tsx` と同じ形）。
 */
export default async function SsoSettingsPage() {
  const t = await getT("sso");
  const result = await apiFetch<{ data: SamlSettings }>("/api/settings/saml");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {result.ok ? (
        <SamlSettingsManager settings={result.data.data} />
      ) : (
        <ErrorBanner message={result.message} />
      )}
    </div>
  );
}
