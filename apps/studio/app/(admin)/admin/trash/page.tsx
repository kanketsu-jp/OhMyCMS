import { ErrorBanner } from "@/components/admin/error-banner";
import { TrashManager, type TrashListPayload } from "@/components/admin/trash-manager";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

export default async function TrashPage() {
  const t = await getT("trash");
  const tError = await getT("errors");
  const result = await apiFetch<TrashListPayload>("/api/trash");

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <p className="text-base text-muted-foreground">{t("description")}</p>
      </div>
      {result.ok ? (
        <TrashManager
          initial={result.data.data}
          retentionDays={result.data.retention_days}
          lastPurge={result.data.last_purge}
        />
      ) : (
        <ErrorBanner message={tError(result.messageKey)} />
      )}
    </div>
  );
}
