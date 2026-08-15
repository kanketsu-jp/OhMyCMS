"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ImageIcon, Upload, X } from "lucide-react";
import { FileDropzone } from "@/components/admin/file-dropzone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromApiCode, FALLBACK_ERROR_KEY, type ErrorKey } from "@/i18n/error";

type FileRow = {
  id: string;
  filename_download: string;
  title: string | null;
  type: string | null;
};

type ApiList<T> = {
  data: T[];
};

type Props = {
  inputId: string;
  name: string;
  defaultValue?: string;
};

/**
 * 🚨 **API の生文言を画面へ出さない。** code だけを見て辞書の鍵へ写す。
 *    生文言は `lib/` に直書きされた日本語なので、**英語で見ている人の画面にも日本語が出る**。
 *    表に無い code は `null` を返し、呼び出し側の具体的な文言を使う
 *    （`unexpected`「予期しないエラー」より、その場の文言のほうが正確なため）。
 */
function errorKeyFrom(payload: unknown): ErrorKey | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "code" in payload.error &&
    typeof payload.error.code === "string"
  ) {
    const key = errorKeyFromApiCode(payload.error.code);
    return key === FALLBACK_ERROR_KEY ? null : key;
  }
  return null;
}

function isImage(file: FileRow | null): boolean {
  return Boolean(file?.type?.startsWith("image/"));
}

export function FilePicker({ inputId, name, defaultValue = "" }: Props) {
  const t = useT("files");
  const tError = useT("errors");
  const errorMessage = (payload: unknown, fallback: string) => {
    const key = errorKeyFrom(payload);
    return key ? tError(key) : fallback;
  };
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [value, setValue] = useState(defaultValue);
  const [selected, setSelected] = useState<FileRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedFromList = useMemo(
    () => files.find((file) => file.id === value) ?? selected,
    [files, selected, value],
  );

  async function loadFiles() {
    const response = await fetch("/api/files?limit=100", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as ApiList<FileRow> | unknown;
    if (!response.ok) {
      setError(errorMessage(payload, response.status === 403 ? t("error_forbidden") : t("error_files_load_failed")));
      return;
    }
    const rows = (payload as ApiList<FileRow>).data;
    setFiles(rows);
    setSelected(rows.find((file) => file.id === value) ?? null);
  }

  const upload = useSubmitOnce(async (formData: FormData) => {
    setError(null);
    const response = await fetch("/api/files", { method: "POST", body: formData });
    const payload = await response.json().catch(() => null) as { data?: FileRow } | unknown;
    if (!response.ok) {
      setError(errorMessage(payload, response.status === 403 ? t("error_forbidden") : t("error_upload_failed")));
      return;
    }
    const row = (payload as { data: FileRow }).data;
    setFiles((current) => [row, ...current.filter((file) => file.id !== row.id)]);
    setValue(row.id);
    setSelected(row);
  });

  function choose(file: FileRow) {
    setValue(file.id);
    setSelected(file);
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <input id={inputId} type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {/* 🚨 `data-file-picker-trigger` は**測るための手掛かり**。
                `[data-slot=dialog-trigger]` で掴もうとすると、PC では左の並びにある
                別のダイアログ（不具合報告など）を先に掴んでしまい、**この箱を開けないまま
                「違反なし」が出る**（2026-08-15 実測。SP は並びが畳まれているので開けていた）。
                `data-slot` を使わないのは、`asChild` で `DialogTrigger` 側の値と
                取り合いになるため。
                使い方: audit-surface-depth.mjs --click '[data-file-picker-trigger]' */}
            <Button
              type="button"
              variant="outline"
              data-file-picker-trigger
              onClick={() => void loadFiles()}
            >
              {t("select_file_button")}
            </Button>
          </DialogTrigger>
          {/* 🚨 `scroll-fade-y` は **スクロールする要素そのもの**（ここでは DialogContent）に当てる。
              外側に巻かない・影で代用しない（影は面なので深さが1段増える）。
              憲章 §6「スクロールできる所は、できると分かる」。SP では一覧が確実に画面を超える。
              `ScrollFade` で包まないのは、包むとスクロールするのが内側の div になり、
              ダイアログの余白の外にマスクが乗って端が切れるため（作法は components/ui/scroll-fade.tsx）。 */}
          <DialogContent className="max-h-[84vh] overflow-y-auto scroll-fade-y sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("select_file_title")}</DialogTitle>
              <DialogDescription>
                {t("select_file_description")}
              </DialogDescription>
            </DialogHeader>
            {/* 🚨 「ファイルを選択 / ファイル未選択」を画面に出さない（オーナー指摘）。
                素の input は FileDropzone の中に隠してある。 */}
            <form action={upload.run} className="grid gap-3">
              {/* 🚨 `flat` … ダイアログ（`DialogContent` は `bg-popover` を持つ＝**面**）の中なので、
                  選んだ後の Attachment が器を持つと2段目になる。
                  実測: 渡す前は pc で **深さ2**（当時は Storybook の Pages/FilePicker で測定）。
                  🚨 **2026-08-15 に実アプリ（:3102）で測り直した。**
                  `audit-surface-depth.mjs --paths /admin/content/zz_probe_dialog/new
                   --click '[data-file-picker-trigger]'` で**ダイアログを開いた状態**にして、
                  面の入れ子・scroll-fade とも**違反なし**を確認している。
                  🚨 Storybook は**書体が当たっておらず（Times に落ちる）**、
                  **行送り・折り返し・書体の字幅に依存する高さ**は測れない（2026-08-15・design の実測）。
                  面の深さは罫線・背景・影で決まるので**書体には依存しない**が、
                  **測った場所が違う**ので、根拠を実アプリ側へ差し替えた。 */}
              <FileDropzone name="file" flat label={t("select_file_title")} />
              <Button type="submit" className="w-full md:w-fit" disabled={upload.pending}>
                <Upload />
                {t("upload_button")}
              </Button>
            </form>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((file) => (
                <button
                  type="button"
                  key={file.id}
                  onClick={() => choose(file)}
                  className="min-w-0 rounded-md p-2 text-left hover:bg-muted active:bg-muted/80"
                >
                  {/* 🚨 画像のレターボックス。**背景が要るので面に見えるが、面ではない**。
                      縦横比の違う画像を同じ大きさの枠に収めるための下地で、
                      中身（画像 or 拡張子の表示）が枠より小さいときに素通しになるのを防いでいる。
                      例外を検査スクリプト側に隠さず、コードに書いて見えるようにしている
                      （file-dropzone.tsx / app/(admin)/admin/files/page.tsx と同じ作法）。 */}
                  <div
                    data-surface-exempt
                    className="flex h-28 items-center justify-center overflow-hidden rounded-md bg-muted"
                  >
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
                      <div className="text-center text-sm text-muted-foreground">
                        <ImageIcon className="mx-auto mb-2 size-8" />
                        {file.filename_download.split(".").pop()?.toUpperCase() ?? t("file_extension_fallback")}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm font-medium">{file.title ?? file.filename_download}</p>
                  <p className="truncate text-xs text-muted-foreground">{file.id}</p>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        {value ? (
          <Button type="button" variant="ghost" onClick={() => setValue("")}>
            <X />
            {t("clear_button")}
          </Button>
        ) : null}
      </div>
      {value ? (
        <div className="flex items-center gap-3 py-2">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-md bg-muted">
            {isImage(selectedFromList) ? (
              <Image
                src={`/api/assets/${value}?width=200&fit=cover`}
                alt={selectedFromList?.title ?? value}
                width={200}
                height={200}
                unoptimized
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{selectedFromList?.title ?? selectedFromList?.filename_download ?? value}</p>
            <p className="truncate text-xs text-muted-foreground">{value}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
