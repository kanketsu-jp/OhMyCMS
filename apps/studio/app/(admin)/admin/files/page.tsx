import Link from "next/link";
import Image from "next/image";
import { FileIcon } from "lucide-react";
import { ErrorBanner } from "@/components/admin/error-banner";
import { FileUploadForm } from "@/components/admin/files-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/admin/api";

type Props = {
  searchParams: Promise<{ folder?: string }>;
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

function extension(file: FileRow): string {
  return file.filename_download.split(".").pop()?.toUpperCase() ?? "FILE";
}

export default async function FilesPage({ searchParams }: Props) {
  const query = await searchParams;
  const folderQuery = query.folder ? `?folder=${encodeURIComponent(query.folder)}` : "";
  const [filesResult, foldersResult] = await Promise.all([
    apiFetch<{ data: FileRow[] }>(`/api/files${folderQuery}`),
    apiFetch<{ data: FolderRow[] }>("/api/folders"),
  ]);
  const folders = foldersResult.ok ? foldersResult.data.data : [];

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">ファイル</h1>
          <p className="mt-1 text-sm text-muted-foreground">アップロード済みファイルとメタ情報を管理します。</p>
        </div>
        <Link href="/admin/folders" className="text-sm text-muted-foreground hover:underline">
          フォルダ管理へ
        </Link>
      </div>
      <ErrorBanner
        message={
          (!filesResult.ok ? filesResult.message : null) ??
          (!foldersResult.ok ? foldersResult.message : null)
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>アップロード</CardTitle>
        </CardHeader>
        <CardContent>
          <FileUploadForm folders={folders} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>一覧</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex max-w-sm gap-2" action="/admin/files">
            <select name="folder" className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm" defaultValue={query.folder ?? ""}>
              <option value="">すべてのフォルダ</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            <button type="submit" className="rounded-lg border px-3 text-sm hover:bg-muted">絞り込み</button>
          </form>
          {filesResult.ok ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {filesResult.data.data.map((file) => (
                <Link key={file.id} href={`/admin/files/${file.id}`} className="min-w-0 rounded-md border bg-background p-3 hover:bg-muted">
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
                        <span className="text-sm font-medium">{extension(file)}</span>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 truncate text-sm font-medium">{file.title ?? file.filename_download}</p>
                  <p className="truncate text-xs text-muted-foreground">{file.filename_download}</p>
                </Link>
              ))}
              {filesResult.data.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">ファイルはまだありません。</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
