import { ErrorBanner } from "@/components/admin/error-banner";
import { getT } from "@/i18n/server";
import { MailTestButton } from "@/components/admin/mail-test-button";
import { SettingsManager } from "@/components/admin/settings-manager";
import { apiFetch } from "@/lib/admin/api";
import type { Settings } from "@/lib/settings/service";
import { ShortcutSettingsManager } from "@/components/admin/shortcut-settings-manager";
import { SettingsTabs } from "@/components/admin/settings-tabs";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

/**
 * 全体設定（F2 §2-A）。
 * 設定は API 経由で取る（直接 DB を読むと、権限チェックが1系統増えて食い違う）。
 */
export default async function GeneralSettingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab = params.tab === "shortcuts" ? "shortcuts" : "general";
  const tError = await getT("errors");
  const result = await apiFetch<{ data: Settings }>("/api/settings");

  return (
    <div className="max-w-4xl space-y-6">
      <SettingsTabs
        tab={tab}
        general={result.ok ? (
            <>
              <SettingsManager settings={result.data.data} />
              <MailTestButton />
            </>
          ) : (
            <ErrorBanner message={tError(result.messageKey)} />
        )}
        shortcuts={<ShortcutSettingsManager />}
      />
    </div>
  );
}
