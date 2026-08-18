import { ErrorBanner } from "@/components/admin/error-banner";
import { PoliciesManager, type PolicyRow } from "@/components/admin/policies-manager";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { ListPagination } from "@/components/admin/list-pagination";
import { PageTabs } from "@/components/admin/page-tabs";
import {
  PAGE_SIZE,
  currentPage,
  pageHref,
  splitPage,
} from "@/components/admin/pagination-href";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type Props = {
  searchParams: Promise<{ page?: string; tab?: string }>;
};

export default async function PoliciesPage({ searchParams }: Props) {
  const t = await getT("policies");
  const tError = await getT("errors");
  const query = await searchParams;
  const tab = query.tab === "create" ? "create" : "list";
  const page = currentPage(query.page);
  // 🚨 全件は取らない（憲章 §4）。1件多く取って「次があるか」を見る。COUNT(*) は撃たない。
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE + 1),
    offset: String((page - 1) * PAGE_SIZE),
  });
  const result = await apiFetch<{ data: PolicyRow[] }>(`/api/policies?${params.toString()}`);
  const { rows, hasNext } = splitPage(result.ok ? result.data.data : [], PAGE_SIZE);

  return (
    <div className="max-w-6xl space-y-6">
      <ErrorBanner message={!result.ok ? tError(result.messageKey) : null} />
      <PageTabs
        tabs={[
          { href: "/admin/settings/policies?tab=list", label: t("list_tab"), current: tab === "list" },
          { href: "/admin/settings/policies?tab=create", label: t("create_tab"), current: tab === "create" },
        ]}
      />
      <Surface>
        <SurfaceTitle>{t("manage_title")}</SurfaceTitle>
        {result.ok ? <PoliciesManager policies={rows} tab={tab} /> : null}
        {result.ok && tab === "list" ? (
          <ListPagination
            page={page}
            hasNext={hasNext}
            prevHref={page > 1 ? pageHref("/admin/settings/policies", query, page - 1) : null}
            nextHref={hasNext ? pageHref("/admin/settings/policies", query, page + 1) : null}
          />
        ) : null}
      </Surface>
    </div>
  );
}
