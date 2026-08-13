import { ErrorBanner } from "@/components/admin/error-banner";
import { RolesManager, type RoleRow } from "@/components/admin/roles-manager";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

export default async function RolesPage() {
  const t = await getT("roles");
  const result = await apiFetch<{ data: RoleRow[] }>("/api/roles");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Surface>
        <SurfaceTitle>{t("manage_card_title")}</SurfaceTitle>
        {result.ok ? <RolesManager roles={result.data.data} /> : null}
      </Surface>
    </div>
  );
}
