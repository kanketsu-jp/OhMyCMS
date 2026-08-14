import { ErrorBanner } from "@/components/admin/error-banner";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { apiFetch } from "@/lib/admin/api";
import { getT } from "@/i18n/server";
import type { VersionInfo } from "@/lib/version/service";

/**
 * バージョン確認（F2 §2-H）。
 *
 * 🚨 「確認していません」の表示は**言い訳ではなく仕様**。
 *    確認先が未設定のときに外部へ問い合わせに行かないことを、画面でも明言する。
 */
export default async function VersionPage() {
  const t = await getT("version");
  const result = await apiFetch<{ data: VersionInfo }>("/api/version");

  return (
    <div className="max-w-3xl space-y-6">

      {!result.ok ? (
        <ErrorBanner message={result.message} />
      ) : (
        <>
          <Surface className="text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t("current_label")}</span>
                <span className="font-medium">{result.data.data.current}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t("commit_label")}</span>
                <span className="font-mono text-xs">
                  {result.data.data.commit ?? t("commit_unknown")}
                </span>
              </div>
          </Surface>

          <Surface className="text-sm">
            <SurfaceTitle>{t("update_heading")}</SurfaceTitle>
            <UpdateStatus update={result.data.data.update} t={t} />
          </Surface>
        </>
      )}
    </div>
  );
}

function UpdateStatus({
  update,
  t,
}: {
  update: VersionInfo["update"];
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (update.checked) {
    if (!update.isOutdated) return <p>{t("up_to_date")}</p>;
    return (
      <div className="space-y-2">
        <p>{t("outdated", { latest: update.latest })}</p>
        {update.url ? (
          <a href={update.url} className="text-primary hover:text-primary/80" rel="noreferrer noopener">
            {t("release_link")}
          </a>
        ) : null}
      </div>
    );
  }

  if (update.reason === "not_configured") {
    return (
      <div className="space-y-1">
        <p>{t("not_configured")}</p>
        <p className="text-xs text-muted-foreground">{t("not_configured_hint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p>{update.reason === "unreachable" ? t("unreachable") : t("invalid_response")}</p>
      <p className="text-xs text-muted-foreground">{update.detail}</p>
    </div>
  );
}
