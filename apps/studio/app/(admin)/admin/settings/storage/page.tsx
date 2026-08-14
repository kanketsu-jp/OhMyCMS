import { ErrorBanner } from "@/components/admin/error-banner";
import { StorageSettingsManager } from "@/components/admin/storage-settings-manager";
import { apiFetch } from "@/lib/admin/api";
import type { Settings } from "@/lib/settings/service";

/**
 * ストレージ設定。
 * 設定は API 経由で取る（直接 DB を読むと、権限チェックが1系統増えて食い違う）。
 */
export default async function StorageSettingsPage() {
  const result = await apiFetch<{ data: Settings }>("/api/settings");

  return (
    <div className="max-w-4xl space-y-6">

      {result.ok ? (
        <StorageSettingsManager settings={result.data.data} />
      ) : (
        <ErrorBanner message={result.message} />
      )}
    </div>
  );
}
