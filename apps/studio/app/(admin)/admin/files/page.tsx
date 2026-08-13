import Link from "next/link";
import Image from "next/image";
import { FileIcon } from "lucide-react";
import { ErrorBanner } from "@/components/admin/error-banner";
import { FileUploadForm } from "@/components/admin/files-manager";
import { ListPagination } from "@/components/admin/list-pagination";
import {
  GRID_PAGE_SIZE,
  currentPage,
  pageHref,
  splitPage,
} from "@/components/admin/pagination-href";
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

function extension(file: FileRow, fallback: string): string {
  return file.filename_download.split(".").pop()?.toUpperCase() ?? fallback;
}

export default async function FilesPage({ searchParams }: Props) {
  const t = await getT("files");
  const query = await searchParams;
  const page = currentPage(query.page);

  // 🚨 全件は取らない（憲章 §4）。1件だけ多く取って「次があるか」を判定し、描くときに切り落とす。
  // COUNT(*) は撃たない。総件数はこの画面では使わない。
  const params = new URLSearchParams({
    limit: String(GRID_PAGE_SIZE + 1),
    offset: String((page - 1) * GRID_PAGE_SIZE),
  });
  if (query.folder) {
    params.set("folder", query.folder);
  }
  const [filesResult, foldersResult] = await Promise.all([
    apiFetch<{ data: FileRow[] }>(`/api/files?${params.toString()}`),
    apiFetch<{ data: FolderRow[] }>("/api/folders"),
  ]);
  const folders = foldersResult.ok ? foldersResult.data.data : [];
  const { rows: files, hasNext } = splitPage(
    filesResult.ok ? filesResult.data.data : [],
    GRID_PAGE_SIZE,
  );

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Link href="/admin/folders" className="text-sm text-muted-foreground hover:underline">
          {t("folders_link")}
        </Link>
      </div>
      <ErrorBanner
        message={
          (!filesResult.ok ? filesResult.message : null) ??
          (!foldersResult.ok ? foldersResult.message : null)
        }
      />
      <Surface>
        <SurfaceTitle>{t("upload_title")}</SurfaceTitle>
        <FileUploadForm folders={folders} />
      </Surface>
      <Surface>
        <SurfaceTitle>{t("list_title")}</SurfaceTitle>
        <form className="flex max-w-sm gap-2" action="/admin/files">
          <select name="folder" className="h-(--control-h) min-w-0 flex-1 rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc) md:text-sm" defaultValue={query.folder ?? ""}>
            <option value="">{t("all_folders_option")}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
          <button type="submit" className="rounded-lg px-3 text-sm hover:bg-muted">{t("filter_button")}</button>
        </form>
        {filesResult.ok ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {files.map((file) => (
              <Link key={file.id} href={`/admin/files/${file.id}`} className="min-w-0 rounded-md p-3 hover:bg-muted">
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
                  {file.type?.startsWith("image/") ? (
                    <Image
                      src={`/api/assets/${file.id}?width=200&fit=cover`}
                      alt={file.title ?? file.filename_download}
                      width={200}
                      height={200}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <FileIcon className="mx-auto mb-2 size-10" />
                      <span className="text-sm font-medium">{extension(file, t("file_extension_fallback"))}</span>
                    </div>
                  )}
                </div>
                <p className="mt-3 truncate text-sm font-medium">{file.title ?? file.filename_download}</p>
                <p className="truncate text-xs text-muted-foreground">{file.filename_download}</p>
              </Link>
            ))}
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty_files")}</p>
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
  );
}
