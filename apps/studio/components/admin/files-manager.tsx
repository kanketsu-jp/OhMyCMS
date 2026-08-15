"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { FileDropzone } from "@/components/admin/file-dropzone";
import { PageAction } from "@/components/admin/page-action";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromApiCode, FALLBACK_ERROR_KEY, type ErrorKey } from "@/i18n/error";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
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

export function FileUploadForm({
  folders,
  initialFolder,
}: {
  folders: FolderRow[];
  initialFolder?: string | null;
}) {
  const t = useT("files");
  const tError = useT("errors");
  const messageFrom = (payload: unknown, fallback: string) => {
    const key = errorKeyFrom(payload);
    return key ? tError(key) : fallback;
  };
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const upload = useSubmitOnce(async (formData: FormData) => {
    setError(null);
    const response = await fetch("/api/files", { method: "POST", body: formData });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_upload_failed")));
      return;
    }
    router.refresh();
  });

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <form id="file-upload-form" action={upload.run} className="grid gap-4">
        {/* 🚨 「ファイルを選択 / ファイル未選択」を画面に出さない（オーナー指摘）。
            素の input は FileDropzone の中に隠してある。 */}
        {/* 🚨 `flat` … このフォームは /admin/files/new で `<Surface>` の中に置かれる。
            選んだ後に出る Attachment が器を持つと面が2段目になり、実測で**深さ3**まで行っていた。 */}
        <FileDropzone name="file" flat label={t("upload_title")} />
        <select name="folder" className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm" defaultValue={initialFolder === "root" ? "" : initialFolder ?? ""}>
          <option value="">{t("no_folder_option")}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
        <PageAction
          form="file-upload-form"
          role="primary"
          pending={upload.pending}
          label={t("upload_button")}
          icon={<Upload />}
        />
      </form>
    </div>
  );
}
