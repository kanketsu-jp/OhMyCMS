import { ErrorBanner } from "@/components/admin/error-banner";
import { FoldersManager } from "@/components/admin/folders-manager";
import { ListPagination } from "@/components/admin/list-pagination";
import {
  PAGE_SIZE,
  currentPage,
  pageHref,
  splitPage,
} from "@/components/admin/pagination-href";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function FoldersPage({ searchParams }: Props) {
  const t = await getT("folders");
  const query = await searchParams;
  const page = currentPage(query.page);

  // 🚨 全件は取らない（憲章 §4）。1件だけ多く取って「次があるか」を判定し、描くときに切り落とす。
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE + 1),
    offset: String((page - 1) * PAGE_SIZE),
  });
  const result = await apiFetch<{ data: FolderRow[] }>(`/api/folders?${params.toString()}`);
  const { rows: folders, hasNext } = splitPage(
    result.ok ? result.data.data : [],
    PAGE_SIZE,
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Surface>
        <SurfaceTitle>{t("management_title")}</SurfaceTitle>
        {result.ok ? <FoldersManager folders={folders} /> : null}
        {result.ok ? (
          <ListPagination
            page={page}
            hasNext={hasNext}
            prevHref={page > 1 ? pageHref("/admin/folders", query, page - 1) : null}
            nextHref={hasNext ? pageHref("/admin/folders", query, page + 1) : null}
          />
        ) : null}
      </Surface>
    </div>
  );
}
