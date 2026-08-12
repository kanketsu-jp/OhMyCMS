import Link from "next/link";
import type { CollectionResult } from "@/lib/schema/models";
import { ErrorBanner } from "@/components/admin/error-banner";
import { PolicyPermissionsManager } from "@/components/admin/policy-permissions-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type Props = {
  params: Promise<{ id: string }>;
};

type PolicyRow = {
  id: string;
  name: string;
  description: string | null;
  admin_access: boolean;
};

type PermissionRow = {
  id: number;
  policy: string;
  collection: string;
  action: "read" | "create" | "update" | "delete";
  permissions: unknown;
  fields: string | null;
};

export default async function PolicyDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getT("policies");
  const [policyResult, collectionsResult, permissionsResult] = await Promise.all([
    apiFetch<{ data: PolicyRow }>(`/api/policies/${id}`),
    apiFetch<CollectionResult[]>("/api/collections"),
    apiFetch<{ data: PermissionRow[] }>(`/api/permissions?policy=${encodeURIComponent(id)}`),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link href="/admin/settings/policies" className="text-sm text-muted-foreground hover:underline">
          {t("back_to_list")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {policyResult.ok ? policyResult.data.data.name : t("detail_fallback_title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("detail_description")}</p>
      </div>
      <ErrorBanner
        message={
          (!policyResult.ok ? policyResult.message : null) ??
          (!collectionsResult.ok ? collectionsResult.message : null) ??
          (!permissionsResult.ok ? permissionsResult.message : null)
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("permission_rows_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {policyResult.ok && collectionsResult.ok && permissionsResult.ok ? (
            <PolicyPermissionsManager
              policyId={id}
              collections={collectionsResult.data}
              permissions={permissionsResult.data.data}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
