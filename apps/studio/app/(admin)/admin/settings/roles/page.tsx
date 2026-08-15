import { ErrorBanner } from "@/components/admin/error-banner";
import { RolesManager, type RoleRow } from "@/components/admin/roles-manager";
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

export default async function RolesPage({ searchParams }: Props) {
  const t = await getT("roles");
  const tError = await getT("errors");
  const query = await searchParams;
  const page = currentPage(query.page);
  // 🚨 全件は取らない（憲章 §4）。1件多く取って「次があるか」を見る。COUNT(*) は撃たない。
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE + 1),
    offset: String((page - 1) * PAGE_SIZE),
  });
  const result = await apiFetch<{ data: RoleRow[] }>(`/api/roles?${params.toString()}`);
  const { rows, hasNext } = splitPage(result.ok ? result.data.data : [], PAGE_SIZE);

  return (
    <div className="max-w-5xl space-y-6">
      <ErrorBanner message={!result.ok ? tError(result.messageKey) : null} />
      <Surface>
        <SurfaceTitle>{t("manage_card_title")}</SurfaceTitle>
        {result.ok ? <RolesManager roles={rows} /> : null}
        {result.ok ? (
          <ListPagination
            page={page}
            hasNext={hasNext}
            prevHref={page > 1 ? pageHref("/admin/settings/roles", query, page - 1) : null}
            nextHref={hasNext ? pageHref("/admin/settings/roles", query, page + 1) : null}
          />
        ) : null}
      </Surface>
    </div>
  );
}
