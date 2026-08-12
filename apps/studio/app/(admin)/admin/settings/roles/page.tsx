import { ErrorBanner } from "@/components/admin/error-banner";
import { RolesManager, type RoleRow } from "@/components/admin/roles-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/admin/api";

export default async function RolesPage() {
  const result = await apiFetch<{ data: RoleRow[] }>("/api/roles");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ロール</h1>
        <p className="mt-1 text-sm text-muted-foreground">ロール階層と親ロールを管理します。</p>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Card>
        <CardHeader>
          <CardTitle>ロール管理</CardTitle>
        </CardHeader>
        <CardContent>
          {result.ok ? <RolesManager roles={result.data.data} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
