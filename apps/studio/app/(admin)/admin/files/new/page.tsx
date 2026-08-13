import Link from "next/link";
import { ErrorBanner } from "@/components/admin/error-banner";
import { FileUploadForm } from "@/components/admin/files-manager";
import { Surface } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

/**
 * ファイルを追加する画面。
 *
 * 🚨 **一覧の上に置かない**（オーナー指示・design ⑰）。
 * 「ファイル」を押した人はファイルが見たいので、アップロードが上に来ることはない。
 */
type Props = {
  searchParams: Promise<{ folder?: string }>;
};

export default async function NewFilePage({ searchParams }: Props) {
  const t = await getT("files");
  const query = await searchParams;
  const result = await apiFetch<{ data: FolderRow[] }>("/api/folders?limit=100");
  const folders = result.ok ? result.data.data : [];
  const backHref = query.folder && query.folder !== "root"
    ? `/admin/files?folder=${query.folder}`
    : "/admin/files";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
          {t("back_to_list")}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t("upload_title")}</h1>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Surface>
        <FileUploadForm folders={folders} initialFolder={query.folder} />
      </Surface>
    </div>
  );
}
