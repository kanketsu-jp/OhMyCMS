import { ErrorBanner } from "@/components/admin/error-banner";
import { FoldersManager } from "@/components/admin/folders-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

export default async function FoldersPage() {
  const t = await getT("folders");
  const result = await apiFetch<{ data: FolderRow[] }>("/api/folders");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Card>
        <CardHeader>
          <CardTitle>{t("management_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {result.ok ? <FoldersManager folders={result.data.data} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
