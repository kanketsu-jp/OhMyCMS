import Link from "next/link";
import type { CollectionResult } from "@/lib/schema/models";
import { ErrorBanner } from "@/components/admin/error-banner";
import { PolicyPermissionsManager } from "@/components/admin/policy-permissions-manager";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
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
      </div>
      <ErrorBanner
        message={
          (!policyResult.ok ? policyResult.message : null) ??
          (!collectionsResult.ok ? collectionsResult.message : null) ??
          (!permissionsResult.ok ? permissionsResult.message : null)
        }
      />
      <Surface>
        <SurfaceTitle>{t("permission_rows_title")}</SurfaceTitle>
        {policyResult.ok && collectionsResult.ok && permissionsResult.ok ? (
          <PolicyPermissionsManager
            policyId={id}
            collections={collectionsResult.data}
            permissions={permissionsResult.data.data}
          />
        ) : null}
      </Surface>
    </div>
  );
}
