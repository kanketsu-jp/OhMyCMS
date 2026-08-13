import { ErrorBanner } from "@/components/admin/error-banner";
import { SettingsManager } from "@/components/admin/settings-manager";
import { apiFetch } from "@/lib/admin/api";
import { getT } from "@/i18n/server";
import type { Settings } from "@/lib/settings/service";

/**
 * 全体設定（F2 §2-A）。
 * 設定は API 経由で取る（直接 DB を読むと、権限チェックが1系統増えて食い違う）。
 */
export default async function GeneralSettingsPage() {
  const t = await getT("settings");
  const result = await apiFetch<Settings>("/api/settings");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {result.ok ? (
        <SettingsManager settings={result.data} />
      ) : (
        <ErrorBanner message={result.message} />
      )}
    </div>
  );
}
