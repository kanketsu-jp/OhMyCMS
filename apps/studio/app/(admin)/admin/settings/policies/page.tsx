import { ErrorBanner } from "@/components/admin/error-banner";
import { PoliciesManager, type PolicyRow } from "@/components/admin/policies-manager";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

export default async function PoliciesPage() {
  const t = await getT("policies");
  const result = await apiFetch<{ data: PolicyRow[] }>("/api/policies");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Surface>
        <SurfaceTitle>{t("manage_title")}</SurfaceTitle>
        {result.ok ? <PoliciesManager policies={result.data.data} /> : null}
      </Surface>
    </div>
  );
}
