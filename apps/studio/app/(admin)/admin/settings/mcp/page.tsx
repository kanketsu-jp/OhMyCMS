import path from "node:path";
import { KeyRound } from "lucide-react";
import { ErrorBanner } from "@/components/admin/error-banner";
import { McpConnection } from "@/components/admin/mcp-connection";
import { PageAction } from "@/components/admin/page-action";
import { Surface } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type ConnectionInfo = {
  url: string;
};

function mcpEntrypoint(): string {
  return path.resolve(process.cwd(), "../../packages/mcp/dist/index.js");
}

export default async function McpSettingsPage() {
  const t = await getT("mcp");
  const result = await apiFetch<{ data: ConnectionInfo }>("/api/mcp/connection-info");

  return (
    <>
      <PageAction
        href="/admin/settings/agents"
        role="primary"
        label={t("issue_token_link")}
        icon={<KeyRound />}
      />
      <div className="max-w-4xl space-y-6">
        {!result.ok ? (
          <ErrorBanner message={result.message} />
        ) : (
          <Surface>
            <McpConnection url={result.data.data.url} entrypoint={mcpEntrypoint()} />
          </Surface>
        )}
      </div>
    </>
  );
}
