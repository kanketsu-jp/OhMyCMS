import { ErrorBanner } from "@/components/admin/error-banner";
import { getT } from "@/i18n/server";
import { MailTestButton } from "@/components/admin/mail-test-button";
import { SettingsManager } from "@/components/admin/settings-manager";
import { apiFetch } from "@/lib/admin/api";
import type { Settings } from "@/lib/settings/service";

/**
 * 全体設定（F2 §2-A）。
 * 設定は API 経由で取る（直接 DB を読むと、権限チェックが1系統増えて食い違う）。
 */
export default async function GeneralSettingsPage() {
  const tError = await getT("errors");
  const result = await apiFetch<{ data: Settings }>("/api/settings");

  return (
    <div className="max-w-4xl space-y-6">

      {result.ok ? (
        <>
          <SettingsManager settings={result.data.data} />
          <MailTestButton />
        </>
      ) : (
        <ErrorBanner message={tError(result.messageKey)} />
      )}
    </div>
  );
}
