import { ErrorBanner } from "@/components/admin/error-banner";
import { PoliciesManager, type PolicyRow } from "@/components/admin/policies-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardHeader>
          <CardTitle>{t("manage_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {result.ok ? <PoliciesManager policies={result.data.data} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
