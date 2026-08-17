import Link from "next/link";
import { FolderPlus, Upload } from "lucide-react";
import { ErrorBanner } from "@/components/admin/error-banner";
import { FilesDropUpload } from "@/components/admin/files-drop-upload";
import { FilesLightboxGrid } from "@/components/admin/files-lightbox-grid";
import { FilesTable } from "@/components/admin/files-table";
import { FilesViewOptions } from "@/components/admin/files-view-options";
import { FilesViewSwitch } from "@/components/admin/files-view-switch";
import { FolderGrid } from "@/components/admin/folder-grid";
import {
  CARD_COLUMN_CHOICES,
  FILE_COLUMNS,
  cardGridClass,
  readCardColumns,
  readColumns,
  type CardColumns,
  type FileColumn,
} from "@/lib/admin/files-view";
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
import { Surface } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type Props = {
  searchParams: Promise<{
    folder?: string;
    page?: string;
    view?: string;
    label?: string;
    /** 表で出す項目（`type,size`）。🚨 空文字は「全部外した」で、無指定とは別。 */
    cols?: string;
    /** カードを 1 行に並べる数（1〜5）。 */
    cards?: string;
  }>;
};

type FileRow = {
  id: string;
  filename_download: string;
  title: string | null;
  type: string | null;
  folder: string | null;
  filesize: string | number | null;
  uploaded_on: string;
  /** 🚨 ライトボックスの拡大に要る（無いと拡大が黙って効かない）。 */
  width: number | null;
  height: number | null;
};

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
  /** 見分けるための色（Tailwind のトークン名）。付いていなければ null。 */
  color: string | null;
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
  const tError = await getT("errors");
  const query = await searchParams;
  const page = currentPage(query.page);
  const currentFolderId = query.folder && query.folder !== "root" ? query.folder : null;
  const currentLocation = currentFolderId ?? "root";
  /**
   * 見え方は URL に持つ（`?view=table`）。
   * 🚨 **知らない値は既定へ落とす。エラーにしない。** クエリは手で編集されるし、
   *    古いブックマークからも来る。**見え方が壊れているだけで、中身は見せられる**。
   *    （API 側は逆に厳格。`/api/files?limit=99999` は 400 のままにしてある）
   */
  const view: "grid" | "table" = query.view === "table" ? "table" : "grid";
  /** 他のクエリ（フォルダ・ページ）を保ったまま見え方だけ差し替える。 */
  /** 絞り込みを外した行き先（他のクエリは保つ）。 */
  const clearLabelHref = (() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "label" || value === undefined) continue;
      for (const one of Array.isArray(value) ? value : [value]) {
        if (one !== "") params.append(key, one);
      }
    }
    const search = params.toString();
    return search ? `/admin/files?${search}` : "/admin/files";
  })();

  /**
   * 表示形式ごとの設定（表＝出す項目 / カード＝1 行の数）。
   * 🚨 `view` と同じく **URL に持ち、知らない値は既定へ落とす**（`lib/admin/files-view.ts`）。
   */
  const columns = readColumns(query.cols);
  const cardColumns = readCardColumns(query.cards);

  /** 1 つのクエリだけ差し替えた行き先（他は保つ）。🚨 `viewHref` と同じ形。 */
  const withQuery = (key: string, value: string | null): string => {
    const params = new URLSearchParams();
    for (const [name, raw] of Object.entries(query)) {
      if (name === key || raw === undefined) continue;
      for (const one of Array.isArray(raw) ? raw : [raw]) {
        if (one !== "") params.append(name, one);
      }
    }
    // 🚨 `null` は「そのクエリを消す」。**空文字は消さない**——
    //    `?cols=` は「全部外した」という指定で、消すと既定へ戻ってしまう。
    if (value !== null) params.set(key, value);
    const search = params.toString();
    return search ? `/admin/files?${search}` : "/admin/files";
  };

  /**
   * その列を**入れ替えた**ときの行き先。
   * 🚨 **関数ではなく表で渡す**（サーバ側の描画から関数は渡せない）。
   */
  const columnHref = Object.fromEntries(
    FILE_COLUMNS.map((column) => {
      const next = columns.includes(column)
        ? columns.filter((one) => one !== column)
        : FILE_COLUMNS.filter((one) => columns.includes(one) || one === column);
      return [column, withQuery("cols", next.join(","))];
    }),
  ) as Record<FileColumn, string>;

  const cardColumnsHref = Object.fromEntries(
    CARD_COLUMN_CHOICES.map((count) => [count, withQuery("cards", String(count))]),
  ) as Record<CardColumns, string>;

  const viewHref = (target: "grid" | "table"): string => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "view" || value === undefined) continue;
      for (const one of Array.isArray(value) ? value : [value]) {
        if (one !== "") params.append(key, one);
      }
    }
    if (target === "table") params.set("view", "table");
    const search = params.toString();
    return search ? `/admin/files?${search}` : "/admin/files";
  };

  // 🚨 全件は取らない（憲章 §4）。1件だけ多く取って「次があるか」を判定し、描くときに切り落とす。
  // COUNT(*) は撃たない。総件数はこの画面では使わない。
  const params = new URLSearchParams({
    limit: String(GRID_PAGE_SIZE + 1),
    offset: String((page - 1) * GRID_PAGE_SIZE),
    folder: currentLocation,
  });
  // 🚨 ラベルで絞る。**フォルダの絞り込みと同時に効く**（この中の、このラベルが付いたもの）。
  if (query.label) params.set("label", query.label);
  const [filesResult, foldersResult, labelsResult] = await Promise.all([
    apiFetch<{ data: FileRow[] }>(`/api/files?${params.toString()}`),
    apiFetch<{ data: FolderRow[] }>("/api/folders?limit=500"),
    // 🚨 絞り込み中の**名前を出すため**だけに引く。id をそのまま画面に出すと、
    //    利用者は何で絞っているのか分からない。
    apiFetch<{ data: { id: string; name: string }[] }>("/api/labels"),
  ]);
  const activeLabel = query.label && labelsResult.ok
    ? labelsResult.data.data.find((label) => label.id === query.label) ?? null
    : null;
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
                <Link href="/admin/files" className="transition-colors hover:text-foreground active:text-foreground">
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
                  <Link href={filesHref(folder.id)} className="transition-colors hover:text-foreground active:text-foreground">
                    {folder.name}
                  </Link>
                )}
              </BreadcrumbItem>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <ErrorBanner
          message={
            (!filesResult.ok ? tError(filesResult.messageKey) : null) ??
            (!foldersResult.ok ? tError(foldersResult.messageKey) : null)
          }
        />
        {/* 🚨 一覧そのものを受け皿にする。ここへ放り込むと、いま開いているフォルダに入る。 */}
        <FilesDropUpload folder={currentFolderId}>
        <Surface>
          <div className="flex items-center justify-between gap-3">
        {/* 🚨 見出しは出さない（堀池・2026-08-15「「〜一覧」の見出しは全部消す」）。
            見て分かるものに名前を付けない。**右サイドバーの「項目一覧」には出る**ので、
            辞書の鍵は消さないこと（消すと項目一覧の名前が消える）。 */}
            <div className="flex items-center gap-1">
              <FilesViewSwitch view={view} gridHref={viewHref("grid")} tableHref={viewHref("table")} />
              <FilesViewOptions
                view={view}
                columns={columns}
                cardColumns={cardColumns}
                columnHref={columnHref}
                cardColumnsHref={cardColumnsHref}
              />
            </div>
          </div>
          {/* 🚨 絞り込み中であることと、**解除の出口**を必ず出す。
              出さないと「ファイルが減った」ように見えて、戻し方が分からない。 */}
          {activeLabel ? (
            <p className="text-sm text-muted-foreground">
              {t("filtered_by_label", { name: activeLabel.name })}{" "}
              <Link href={clearLabelHref} className="underline">
                {t("clear_filter")}
              </Link>
            </p>
          ) : null}
          {filesResult.ok || foldersResult.ok ? (
            <>
              {/* 表示形式の外に置く。カードと表で伝わる情報が変わっていたため。
                  「元から空」と「絞り込んだ結果 0 件」では、次にする操作が違う。 */}
              {childFolders.length === 0 && files.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {activeLabel ? t("empty_filtered") : t("empty_folder")}
                </p>
              ) : null}
              {view === "table" ? (
                <FilesTable folders={childFolders} files={files} columns={columns} />
              ) : (
                <div className={`grid gap-4 ${cardGridClass(cardColumns)}`}>
                  {foldersResult.ok ? <FolderGrid folders={childFolders} /> : null}
                  <FilesLightboxGrid files={files} />
                </div>
              )}
            </>
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
        </FilesDropUpload>
      </div>
    </>
  );
}
