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
        {/* 🚨 `<h1>` にしない。画面の `<h1>` は `(admin)/layout.tsx` が 1 つだけ出す（sr-only）。
            ここを `<h1>` に戻すと、同じ言葉の見出しが 2 つになる（読み上げで画面名が 2 回読まれる）。
            見た目は変えていない（class はそのまま）。
            🚨 なお、この見える見出しはパンくずと同じ言葉なので、
               本当に要るかは別途 design が問い直す（2026-08-17 時点では残す）。 */}
        <h2 className="font-heading text-2xl font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
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
