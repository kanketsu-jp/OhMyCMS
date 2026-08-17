import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { FileIcon } from "lucide-react";
import { ErrorBanner } from "@/components/admin/error-banner";
import { FileDetailManager } from "@/components/admin/file-detail-manager";
import { FileLabelsEditor, type LabelRow } from "@/components/admin/file-labels-editor";
import { FilePreviewLightbox } from "@/components/admin/file-preview-lightbox";
import { CopyButton } from "@/components/ui/copy-button";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getFormat, getT } from "@/i18n/server";
import { apiFetch, hasApiCode } from "@/lib/admin/api";

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
  /**
   * 取り込み元などの付帯情報。ドライブから取り込んだものは `{ drive: {...} }` が入る。
   * 🚨 形は保証されない（古い行には無い／別の取り込み元が増えるかもしれない）ので、
   *    **読むときに必ず形を確かめる**。
   */
  metadata: unknown;
};

/**
 * 取り込み元の「もとのファイル」への URL を、形を確かめてから取り出す。
 * 🚨 `metadata` は json 列で、**中身の形はデータ次第**。`as` で押し通すと、
 *    古い行や別形式の行で実行時に落ちる。
 */
function sourceLink(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const drive = (metadata as { drive?: unknown }).drive;
  if (!drive || typeof drive !== "object") return null;
  const link = (drive as { webViewLink?: unknown }).webViewLink;
  return typeof link === "string" && link.startsWith("https://") ? link : null;
}

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

export default async function FileDetailPage({ params }: Props) {
  const t = await getT("files");
  const tError = await getT("errors");
  const format = await getFormat();
  const { id } = await params;
  const [fileResult, foldersResult, labelsResult, attachedResult] = await Promise.all([
    apiFetch<{ data: FileRow }>(`/api/files/${id}`),
    apiFetch<{ data: FolderRow[] }>("/api/folders"),
    // 🚨 選べるラベルと、いま付いているラベルは**別の口**。片方だけだと
    //    「付いていない選択肢」を出せない（＝外すことしかできない画面になる）。
    apiFetch<{ data: LabelRow[] }>("/api/labels"),
    apiFetch<{ data: LabelRow[] }>(`/api/files/${id}/labels`),
  ]);

  // 🚨 **無い id は自前の画面でなく notFound() を呼ぶ**（2026-08-17・auth の実測を受けて）。
  //    自前で描くと **HTTP が 200 のまま**になり、機械には「在る」と答えてしまう
  //    （実測: /admin/files/<無い id> が 200。🟢 対照 /admin/zz-nope は 404）。
  //    さらに右パネルの「概要」は**経路だけ**で決まるので、無いファイルの画面で
  //    「このファイルの題・説明・タグ・置き場所を変えられます」と**できないことを約束していた**。
  //    notFound() を呼べば `(admin)/not-found.tsx` が受け、**404 と右パネルの抑止が同時に直る**。
  //    🚨 引き換えに、専用の文言は共有の「見つかりません」になる（schema が content で同じ判断）。
  if (hasApiCode(fileResult, "FILE_NOT_FOUND") || (!fileResult.ok && fileResult.status === 404)) {
    notFound();
  }

  const file = fileResult.ok ? fileResult.data.data : null;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link href="/admin/files" className="text-sm text-muted-foreground hover:text-foreground active:text-foreground">
          {t("back_to_files")}
        </Link>
      </div>
      <ErrorBanner
        message={
          (!fileResult.ok ? tError(fileResult.messageKey) : null) ??
          (!foldersResult.ok ? tError(foldersResult.messageKey) : null)
        }
      />
      {file ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/*
            プレビューは「メディアの受け皿」自体が面になる。
            外側の Surface まで境界を持つと二重になるので tone="plain" にする。
            knowledge/decisions/no-nested-surfaces.md §2-2 の選択肢B（面側の境界を外し、内側に持たせる）。
          */}
          <Surface tone="plain">
            <SurfaceTitle>{t("preview_title")}</SurfaceTitle>
            <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-xl bg-muted">
              {file.type?.startsWith("image/") ? (
                <FilePreviewLightbox
                  image={{
                    src: `/api/assets/${file.id}`,
                    alt: file.title ?? file.filename_download,
                    width: file.width ?? 1000,
                    height: file.height ?? 750,
                  }}
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
              <div>
                <dt className="text-muted-foreground">{t("id_label")}</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <span id="file-detail-id" className="break-all">{file.id}</span>
                  <CopyButton what={t("id_label")} value={file.id} selectTargetId="file-detail-id" data-copy-target="file-detail-id" />
                </dd>
              </div>
              <div><dt className="text-muted-foreground">{t("type_label")}</dt><dd>{file.type ?? ""}</dd></div>
              <div><dt className="text-muted-foreground">{t("size_label")}</dt><dd>{format.fileSize(file.filesize)}</dd></div>
              <div><dt className="text-muted-foreground">{t("dimensions_label")}</dt><dd>{file.width && file.height ? `${file.width} x ${file.height}` : "-"}</dd></div>
              <div><dt className="text-muted-foreground">{t("uploaded_on")}</dt><dd>{format.dateTime(file.uploaded_on)}</dd></div>
            </dl>
          </Surface>
          <Surface>
            <SurfaceTitle>{t("metadata_title")}</SurfaceTitle>
            {/* 🚨 取り込み元がある行だけ出す。無い行に空のボタンを置かない。 */}
            {sourceLink(file.metadata) ? (
              <a
                href={sourceLink(file.metadata) ?? "#"}
                target="_blank"
                // 🚨 別タブで開くリンクには必ず付ける（開いた先から元のページを触られないように）。
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 text-sm underline"
              >
                <ExternalLink className="size-4" />
                {t("view_source")}
              </a>
            ) : null}
            <FileDetailManager file={file} folders={foldersResult.ok ? foldersResult.data.data : []} />
            <FileLabelsEditor
              fileId={file.id}
              all={labelsResult.ok ? labelsResult.data.data : []}
              attached={attachedResult.ok ? attachedResult.data.data : []}
            />
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
