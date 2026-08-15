import Link from "next/link";
import { ErrorBanner } from "@/components/admin/error-banner";
import { DriveImportPanel } from "@/components/admin/drive-import-panel";
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
  /**
   * ドライブの接続状態を**サーバ側で**調べる。
   * 🚨 設定が無いときは 503 が返るので、`ok` でない＝**パネルを出さない**。
   *    クライアントで調べると、**設定が無いのに一瞬パネルが見える**。
   */
  const driveResult = await apiFetch<{
    data: { configured: boolean; connected: boolean; accountEmail: string | null };
  }>(
    "/api/drive/connection",
  );
  const driveConnection = driveResult.ok ? driveResult.data.data : null;
  const backHref = query.folder && query.folder !== "root"
    ? `/admin/files?folder=${query.folder}`
    : "/admin/files";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          {t("back_to_list")}
        </Link>
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      <Surface>
        <FileUploadForm folders={folders} initialFolder={query.folder} />
      </Surface>
      {/* 🚨 設定が無いときは中で何も描かない（管理者が client_id を入れるまで、
          利用者にできることが無いため）。 */}
      <DriveImportPanel folder={query.folder ?? null} initialConnection={driveConnection} />
    </div>
  );
}
