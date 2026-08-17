import Link from "next/link";
import { Upload } from "lucide-react";
import { ErrorBanner } from "@/components/admin/error-banner";
import { FilesDropUpload } from "@/components/admin/files-drop-upload";
import { FilesLightboxGrid } from "@/components/admin/files-lightbox-grid";
import { FilesPageMenu } from "@/components/admin/files-page-menu";
import { FilesTable } from "@/components/admin/files-table";
import { FilesViewOptions } from "@/components/admin/files-view-options";
import { FilesViewSwitch } from "@/components/admin/files-view-switch";
import { FolderGrid } from "@/components/admin/folder-grid";
import { HeaderSearch } from "@/components/admin/header-search";
import {
  CARD_COLUMN_CHOICES,
  FILE_COLUMNS,
  cardGridClass,
  readCardColumns,
  readColumns,
  type CardColumns,
  type FileColumn,
} from "@/lib/admin/files-view";
import { ListEmpty } from "@/components/admin/list-empty";
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
    q?: string;
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
  folder_name: string | null;
  filesize: string | number | null;
  uploaded_on: string;
  modified_on: string | null;
  duration: number | null;
  description: string | null;
  /** 🚨 ライトボックスの拡大に要る（無いと拡大が黙って効かない）。 */
  width: number | null;
  height: number | null;
  is_public: boolean;
};

type ApiFileRow = Omit<FileRow, "folder_name">;

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
  const activeQuery = (query.q ?? "").trim();
  const activeQueryLower = activeQuery.toLowerCase();
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
  const clearQueryHref = (() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "q" || value === undefined) continue;
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

  const gridCardColumnsHref = Object.fromEntries(
    CARD_COLUMN_CHOICES.map((count) => {
      const [path, search = ""] = withQuery("cards", String(count)).split("?");
      const params = new URLSearchParams(search);
      params.delete("view");
      const next = params.toString();
      return [count, next ? `${path}?${next}` : path];
    }),
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
  if (activeQuery) params.set("q", activeQuery);
  const [filesResult, foldersResult, labelsResult] = await Promise.all([
    apiFetch<{ data: ApiFileRow[] }>(`/api/files?${params.toString()}`),
    apiFetch<{ data: FolderRow[] }>("/api/folders?limit=500"),
    // 🚨 絞り込み中の**名前を出すため**だけに引く。id をそのまま画面に出すと、
    //    利用者は何で絞っているのか分からない。
    apiFetch<{ data: { id: string; name: string }[] }>("/api/labels"),
  ]);
  const activeLabel = query.label && labelsResult.ok
    ? labelsResult.data.data.find((label) => label.id === query.label) ?? null
    : null;
  const folders = foldersResult.ok ? foldersResult.data.data : [];
  const folderNameById = new Map(folders.map((folder) => [folder.id, folder.name]));
  const childFolders = folders.filter(
    (folder) =>
      folder.parent === currentFolderId &&
      (activeQuery === "" || folder.name.toLowerCase().includes(activeQueryLower)),
  );
  const breadcrumbs = folderPath(folders, currentFolderId);
  const { rows: pagedFiles, hasNext } = splitPage(
    filesResult.ok ? filesResult.data.data : [],
    GRID_PAGE_SIZE,
  );
  const files: FileRow[] = pagedFiles.map((file) => ({
    ...file,
    folder_name: file.folder ? folderNameById.get(file.folder) ?? null : null,
  }));
  const newFolderHref = `/admin/files/new-folder?parent=${currentLocation}`;
  const newFileHref = `/admin/files/new?folder=${currentLocation}`;

  return (
    <>
      {/* 🚨 行き先は `newFileHref` / `newFolderHref`（既存の変数）を渡す。
          `page-actions.ts` の `/admin/files/new` は**ルートの形**であって行き先ではない。
          直書きすると `?folder=` が落ちて「フォルダの中で追加を押すと根に作られる」退行になる。 */}
      {/* 🚨 **主操作は 1 本にする**（堀池・2026-08-17・C1）。原文:
          「アクションボタンの使い方が間違っています。一つのアクションを固定するのではなく、
            『ファイルを追加』をメインとし、そのオプションとして『フォルダを作る』が
            選べるようなボタングループの形式にしてください。」

          🚨 **新しい部品は要らない。** `PageAction` は `options` を渡すと `ButtonGroup`（主 + ▾）を
          描く（`page-action.tsx` の `if (!options?.length) return 主;`）。
          直す前に chevron が 0 件だったのは**渡していなかったから**で、部品が無いからではない。

          🚨 **行き先は変数をそのまま渡す。** `page-actions.ts` の `/admin/files/new-folder` は
          **ルートの形**であって行き先ではない。直書きすると `?parent=` が落ちて、
          **フォルダの中で押すと根に作られる**退行になる（同ファイルの既存の申し送りと同じ罠）。 */}
      <HeaderSearch />
      <PageAction
        href={newFileHref}
        role="primary"
        label={t("new_file_button")}
        icon={<Upload />}
        options={[{ label: t("new_folder_button"), href: newFolderHref }]}
      />
      <div className="flex max-w-7xl flex-col gap-6">
        {/* 🚨 **先頭の「ファイル」を落とした**（堀池・2026-08-17・C3）。原文:
            「admin/files ページ上部の『ファイル』というタイトルは不要です。
              パンくずリストで表示されているためです。」
            ＝ ヘッダーのパンくずが既に「ファイル」を出しており、**同じ語が 2 箇所**だった。
            【測った 2026-08-17】読み上げでも重複していた——`/admin/files` では
            現在地を名乗るランドマークが **2 つ**露出していた（ヘッダー「現在の場所」＋
            ここ「ファイルの現在位置」）。PC 1280 でも SP 390 でも 2 つ。

            🚨 **道筋の作りは変えていない**（司令塔の決め・2026-08-17）。
              ヘッダーのパンくずは `pathname` だけから組み立てるので、
              **フォルダ（`?folder=` のクエリ）を載せられない**。だからフォルダの階層は
              ここに残す。載せる仕組みを作る案（page-trail に継ぎ足す口）は、
              `page-trail.ts` の「2 箇所で組み立てないこと」と正面からぶつかるため採らなかった。

            🚨 **フォルダが 0 件のときは `nav` ごと出さない。**
              先頭を落とした結果、根に居ると中身が空になる。空の `nav` を残すと
              **「現在地を名乗るランドマーク」が中身なしで読み上げに出る**。
              D3（項目一覧がゼロならアコーディオン自体を出さない）と同じ考え方。 */}
        {breadcrumbs.length > 0 ? (
        <Breadcrumb aria-label={t("breadcrumb_label")}>
          <BreadcrumbList>
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
        ) : null}
        <ErrorBanner
          message={
            (!filesResult.ok ? tError(filesResult.messageKey) : null) ??
            (!foldersResult.ok ? tError(foldersResult.messageKey) : null)
          }
        />
        {/* 🚨 一覧そのものを受け皿にする。ここへ放り込むと、いま開いているフォルダに入る。 */}
        <FilesDropUpload folder={currentFolderId}>
        <FilesPageMenu newFileHref={newFileHref} newFolderHref={newFolderHref}>
        <Surface>
          <div className="flex items-center justify-between gap-3">
        {/* 🚨 見出しは出さない（堀池・2026-08-15「「〜一覧」の見出しは全部消す」）。
            見て分かるものに名前を付けない。**右サイドバーの「項目一覧」には出る**ので、
            辞書の鍵は消さないこと（消すと項目一覧の名前が消える）。 */}
            <div className="flex items-center gap-1">
              <FilesViewSwitch
                view={view}
                tableHref={viewHref("table")}
                cardColumns={cardColumns}
                gridCardColumnsHref={gridCardColumnsHref}
              />
              <FilesViewOptions
                view={view}
                columns={columns}
                columnHref={columnHref}
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
          {activeQuery ? (
            <p className="text-sm text-muted-foreground">
              {t("filtered_by_query", { q: activeQuery })}{" "}
              <Link href={clearQueryHref} className="underline">
                {t("clear_filter")}
              </Link>
            </p>
          ) : null}
          {filesResult.ok || foldersResult.ok ? (
            <>
              {/* 表示形式の外に置く。カードと表で伝わる情報が変わっていたため。
                  「元から空」と「絞り込んだ結果 0 件」では、次にする操作が違う。 */}
              {childFolders.length === 0 && files.length === 0 ? (
                <ListEmpty>
                  {activeLabel || activeQuery ? (
                    // 🚨 絞った結果の 0 件は、**次にできることが既に本文に在る**
                    //    （上の「絞り込みを解除」）。ここに足すと同じ出口が 2 つになる。
                    t("empty_filtered")
                  ) : (
                    <>
                      {t("empty_folder")}{" "}
                      {/* 🚨 空のときは「無い」で終わらせない（DESIGN.md §1-10）。
                          主ボタンはヘッダーへ portal で出ているが、**本文にも置いてよい**。
                          🚨 行き先は `newFileHref` / `newFolderHref` を使う。
                             直書きすると `?folder=` が落ちて、**空のフォルダを開いたまま
                             追加したのに根に作られる**（この画面で前に踏んだ形）。 */}
                      <Link href={newFileHref} className="underline">
                        {t("new_file_button")}
                      </Link>{" "}
                      <Link href={newFolderHref} className="underline">
                        {t("new_folder_button")}
                      </Link>
                    </>
                  )}
                </ListEmpty>
              ) : null}
              {view === "table" ? (
                <FilesTable folders={childFolders} files={files} columns={columns} />
              ) : (
                <div className={`grid gap-4 ${cardGridClass(cardColumns)}`}>
                  {foldersResult.ok ? (
                    <FolderGrid
                      folders={childFolders}
                      currentFolderId={currentFolderId}
                      parentFolderId={
                        currentFolderId
                          ? folders.find((folder) => folder.id === currentFolderId)?.parent ?? null
                          : null
                      }
                    />
                  ) : null}
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
        </FilesPageMenu>
        </FilesDropUpload>
      </div>
    </>
  );
}
