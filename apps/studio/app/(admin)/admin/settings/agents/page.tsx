import { AgentsManager } from "@/components/admin/agents-manager";
import { ErrorBanner } from "@/components/admin/error-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const result = await apiFetch<{ data: AgentRow[] }>("/api/auth/agents");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">エージェント</h1>
        <p className="mt-1 text-sm text-muted-foreground">エージェントトークンを発行・失効します。</p>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Card>
        <CardHeader>
          <CardTitle>エージェント管理</CardTitle>
        </CardHeader>
        <CardContent>
          {result.ok ? <AgentsManager agents={result.data.data} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
