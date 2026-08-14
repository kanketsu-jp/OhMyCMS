import { AgentsManager } from "@/components/admin/agents-manager";
import { ErrorBanner } from "@/components/admin/error-banner";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type AgentRow = {
  id: string;
  name: string;
  on_behalf_of: string;
  tenant_scope: unknown;
  capabilities: unknown;
  origin: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export default async function AgentsPage() {
  const t = await getT("agents");
  const result = await apiFetch<{ data: AgentRow[] }>("/api/auth/agents");

  return (
    <div className="max-w-6xl space-y-6">
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Surface>
        <SurfaceTitle>{t("manage_title")}</SurfaceTitle>
        {result.ok ? <AgentsManager agents={result.data.data} /> : null}
      </Surface>
    </div>
  );
}
