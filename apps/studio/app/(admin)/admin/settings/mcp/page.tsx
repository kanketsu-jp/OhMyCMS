import path from "node:path";
import { ErrorBanner } from "@/components/admin/error-banner";
import { McpConnection } from "@/components/admin/mcp-connection";
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
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {!result.ok ? (
        <ErrorBanner message={result.message} />
      ) : (
        <Surface>
          <McpConnection url={result.data.data.url} entrypoint={mcpEntrypoint()} />
        </Surface>
      )}
    </div>
  );
}
