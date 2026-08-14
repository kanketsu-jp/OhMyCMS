import Link from "next/link";
import { FolderPlus, Upload } from "lucide-react";
import { ErrorBanner } from "@/components/admin/error-banner";
import { FilesLightboxGrid } from "@/components/admin/files-lightbox-grid";
import { FolderGrid } from "@/components/admin/folder-grid";
import { ListPagination } from "@/components/admin/list-pagination";
import { PageAction } from "@/components/admin/page-action";
import {
  GRID_PAGE_SIZE,
  currentPage,
  pageHref,
  splitPage,
} from "@/components/admin/pagination-href";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type Props = {
  searchParams: Promise<{ folder?: string; page?: string }>;
};

type FileRow = {
  id: string;
  filename_download: string;
  title: string | null;
  type: string | null;
  folder: string | null;
  filesize: string | number | null;
  uploaded_on: string;
};

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

function filesHref(folderId: string | null): string {
  return folderId ? `/admin/files?folder=${folderId}` : "/admin/files";
}

function folderPath(folders: FolderRow[], folderId: string | null): FolderRow[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: FolderRow[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(folderId) ?? null;

  while (cursor && !seen.has(cursor.id)) {
    path.unshift(cursor);
    seen.add(cursor.id);
    cursor = cursor.parent ? byId.get(cursor.parent) ?? null : null;
  }

  return path;
}

export default async function FilesPage({ searchParams }: Props) {
  const t = await getT("files");
  const query = await searchParams;
  const page = currentPage(query.page);
  const currentFolderId = query.folder && query.folder !== "root" ? query.folder : null;
  const currentLocation = currentFolderId ?? "root";

  // 🚨 全件は取らない（憲章 §4）。1件だけ多く取って「次があるか」を判定し、描くときに切り落とす。
  // COUNT(*) は撃たない。総件数はこの画面では使わない。
  const params = new URLSearchParams({
    limit: String(GRID_PAGE_SIZE + 1),
    offset: String((page - 1) * GRID_PAGE_SIZE),
    folder: currentLocation,
  });
  const [filesResult, foldersResult] = await Promise.all([
    apiFetch<{ data: FileRow[] }>(`/api/files?${params.toString()}`),
    apiFetch<{ data: FolderRow[] }>("/api/folders?limit=500"),
  ]);
  const folders = foldersResult.ok ? foldersResult.data.data : [];
  const childFolders = folders.filter((folder) => folder.parent === currentFolderId);
  const breadcrumbs = folderPath(folders, currentFolderId);
  const { rows: files, hasNext } = splitPage(
    filesResult.ok ? filesResult.data.data : [],
    GRID_PAGE_SIZE,
  );
  const newFolderHref = `/admin/files/new-folder?parent=${currentLocation}`;
  const newFileHref = `/admin/files/new?folder=${currentLocation}`;

  return (
    <>
      {/* 🚨 行き先は `newFileHref` / `newFolderHref`（既存の変数）を渡す。
          `page-actions.ts` の `/admin/files/new` は**ルートの形**であって行き先ではない。
          直書きすると `?folder=` が落ちて「フォルダの中で追加を押すと根に作られる」退行になる。 */}
      <PageAction
        href={newFileHref}
        role="primary"
        label={t("new_file_button")}
        icon={<Upload />}
      />
      <PageAction
        href={newFolderHref}
        role="secondary"
        label={t("new_folder_button")}
        icon={<FolderPlus />}
      />
      <div className="flex max-w-7xl flex-col gap-6">
        <Breadcrumb aria-label={t("breadcrumb_label")}>
          <BreadcrumbList>
            <BreadcrumbItem>
              {breadcrumbs.length === 0 ? (
                <BreadcrumbPage>{t("title")}</BreadcrumbPage>
              ) : (
                <Link href="/admin/files" className="transition-colors hover:text-foreground">
                  {t("title")}
                </Link>
              )}
            </BreadcrumbItem>
            {breadcrumbs.map((folder, index) => (
              <BreadcrumbItem key={folder.id}>
                <BreadcrumbSeparator />
                {index === breadcrumbs.length - 1 ? (
                  <BreadcrumbPage>{folder.name}</BreadcrumbPage>
                ) : (
                  <Link href={filesHref(folder.id)} className="transition-colors hover:text-foreground">
                    {folder.name}
                  </Link>
                )}
              </BreadcrumbItem>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <ErrorBanner
          message={
            (!filesResult.ok ? filesResult.message : null) ??
            (!foldersResult.ok ? foldersResult.message : null)
          }
        />
        <Surface>
          <SurfaceTitle>{t("list_title")}</SurfaceTitle>
          {filesResult.ok || foldersResult.ok ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {foldersResult.ok ? <FolderGrid folders={childFolders} /> : null}
              <FilesLightboxGrid files={files} />
              {childFolders.length === 0 && files.length === 0 ? (
                <p className="col-span-full text-sm text-muted-foreground">{t("empty_folder")}</p>
              ) : null}
            </div>
          ) : null}
          {filesResult.ok ? (
            <ListPagination
              page={page}
              hasNext={hasNext}
              prevHref={page > 1 ? pageHref("/admin/files", query, page - 1) : null}
              nextHref={hasNext ? pageHref("/admin/files", query, page + 1) : null}
            />
          ) : null}
        </Surface>
      </div>
    </>
  );
}
