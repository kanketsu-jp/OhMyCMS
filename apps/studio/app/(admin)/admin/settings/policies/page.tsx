import { ErrorBanner } from "@/components/admin/error-banner";
import { PoliciesManager, type PolicyRow } from "@/components/admin/policies-manager";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { ListPagination } from "@/components/admin/list-pagination";
import {
  PAGE_SIZE,
  currentPage,
  pageHref,
  splitPage,
} from "@/components/admin/pagination-href";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function PoliciesPage({ searchParams }: Props) {
  const t = await getT("policies");
  const query = await searchParams;
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
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Surface>
        <SurfaceTitle>{t("manage_title")}</SurfaceTitle>
        {result.ok ? <PoliciesManager policies={rows} /> : null}
        {result.ok ? (
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
