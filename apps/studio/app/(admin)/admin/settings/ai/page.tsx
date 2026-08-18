import { KeyRound } from "lucide-react";

import { AgentsManager } from "@/components/admin/agents-manager";
import { ErrorBanner } from "@/components/admin/error-banner";
import { McpConnection } from "@/components/admin/mcp-connection";
import { PageAction } from "@/components/admin/page-action";
import { PageTabs } from "@/components/admin/page-tabs";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

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

type ConnectionInfo = {
  url: string;
};

export default async function AiSettingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab = params.tab === "mcp" ? "mcp" : "agents";
  const tNav = await getT("nav");

  return (
    <div className="space-y-6">
      <PageTabs
        tabs={[
          {
            href: "/admin/settings/ai?tab=agents",
            label: tNav("settings_child_agents"),
            current: tab === "agents",
          },
          {
            href: "/admin/settings/ai?tab=mcp",
            label: tNav("settings_child_mcp"),
            current: tab === "mcp",
          },
        ]}
      />

      {tab === "mcp" ? <McpSettingsPanel /> : <AgentsSettingsPanel />}
    </div>
  );
}

async function AgentsSettingsPanel() {
  const tAgents = await getT("agents");
  const tError = await getT("errors");
  const result = await apiFetch<{ data: AgentRow[] }>("/api/auth/agents");

  return (
    <div className="max-w-6xl space-y-6">
      <ErrorBanner message={!result.ok ? tError(result.messageKey) : null} />
      <Surface>
        <SurfaceTitle>{tAgents("manage_title")}</SurfaceTitle>
        {result.ok ? <AgentsManager agents={result.data.data} /> : null}
      </Surface>
    </div>
  );
}

async function McpSettingsPanel() {
  const tMcp = await getT("mcp");
  const tError = await getT("errors");
  const result = await apiFetch<{ data: ConnectionInfo }>("/api/mcp/connection-info");

  return (
    <>
      <PageAction
        href="/admin/settings/ai?tab=agents"
        role="primary"
        label={tMcp("issue_token_link")}
        icon={<KeyRound />}
      />
      <div className="max-w-4xl space-y-6">
        {!result.ok ? (
          <ErrorBanner message={tError(result.messageKey)} />
        ) : (
          <Surface>
            <McpConnection url={result.data.data.url} />
          </Surface>
        )}
      </div>
    </>
  );
}
