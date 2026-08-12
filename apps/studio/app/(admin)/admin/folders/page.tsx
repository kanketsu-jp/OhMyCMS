import { ErrorBanner } from "@/components/admin/error-banner";
import { FoldersManager } from "@/components/admin/folders-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/admin/api";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

export default async function FoldersPage() {
  const result = await apiFetch<{ data: FolderRow[] }>("/api/folders");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">フォルダ</h1>
        <p className="mt-1 text-sm text-muted-foreground">ファイル用フォルダを管理します。</p>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Card>
        <CardHeader>
          <CardTitle>フォルダ管理</CardTitle>
        </CardHeader>
        <CardContent>
          {result.ok ? <FoldersManager folders={result.data.data} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
