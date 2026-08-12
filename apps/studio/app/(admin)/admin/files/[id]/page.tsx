import Link from "next/link";
import Image from "next/image";
import { FileIcon } from "lucide-react";
import { ErrorBanner } from "@/components/admin/error-banner";
import { FileDetailManager } from "@/components/admin/file-detail-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormat, getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type Props = {
  params: Promise<{ id: string }>;
};

type FileRow = {
  id: string;
  filename_download: string;
  title: string | null;
  type: string | null;
  folder: string | null;
  filesize: string | number | null;
  width: number | null;
  height: number | null;
  description: string | null;
  tags: string | null;
  uploaded_on: string;
};

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

export default async function FileDetailPage({ params }: Props) {
  const t = await getT("files");
  const format = await getFormat();
  const { id } = await params;
  const [fileResult, foldersResult] = await Promise.all([
    apiFetch<{ data: FileRow }>(`/api/files/${id}`),
    apiFetch<{ data: FolderRow[] }>("/api/folders"),
  ]);

  const file = fileResult.ok ? fileResult.data.data : null;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link href="/admin/files" className="text-sm text-muted-foreground hover:underline">
          {t("back_to_files")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{file?.title ?? file?.filename_download ?? t("detail_fallback_title")}</h1>
      </div>
      <ErrorBanner
        message={
          (!fileResult.ok ? fileResult.message : null) ??
          (!foldersResult.ok ? foldersResult.message : null)
        }
      />
      {file ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardHeader>
              <CardTitle>{t("preview_title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-md bg-muted">
                {file.type?.startsWith("image/") ? (
                  <Image
                    src={`/api/assets/${file.id}`}
                    alt={file.title ?? file.filename_download}
                    width={file.width ?? 1000}
                    height={file.height ?? 750}
                    unoptimized
                    className="max-h-[70vh] max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <FileIcon className="mx-auto mb-3 size-12" />
                    <p className="font-medium">{file.filename_download}</p>
                    <p className="text-sm">{file.type ?? "application/octet-stream"}</p>
                  </div>
                )}
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">{t("id_label")}</dt><dd className="break-all">{file.id}</dd></div>
                <div><dt className="text-muted-foreground">{t("type_label")}</dt><dd>{file.type ?? ""}</dd></div>
                <div><dt className="text-muted-foreground">{t("size_label")}</dt><dd>{format.fileSize(file.filesize)}</dd></div>
                <div><dt className="text-muted-foreground">{t("dimensions_label")}</dt><dd>{file.width && file.height ? `${file.width} x ${file.height}` : "-"}</dd></div>
                <div><dt className="text-muted-foreground">{t("uploaded_on")}</dt><dd>{format.dateTime(file.uploaded_on)}</dd></div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("metadata_title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FileDetailManager file={file} folders={foldersResult.ok ? foldersResult.data.data : []} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
