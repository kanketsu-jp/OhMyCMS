import { ErrorBanner } from "@/components/admin/error-banner";
import { PoliciesManager, type PolicyRow } from "@/components/admin/policies-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/admin/api";

export default async function PoliciesPage() {
  const result = await apiFetch<{ data: PolicyRow[] }>("/api/policies");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ポリシー</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          権限ルールをまとめるポリシーを管理します。
        </p>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Card>
        <CardHeader>
          <CardTitle>ポリシー管理</CardTitle>
        </CardHeader>
        <CardContent>
          {result.ok ? <PoliciesManager policies={result.data.data} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
