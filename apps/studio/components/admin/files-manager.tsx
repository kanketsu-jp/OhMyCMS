"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { FileDropzone } from "@/components/admin/file-dropzone";
import { Button } from "@/components/ui/button";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

function messageFrom(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}

export function FileUploadForm({ folders }: { folders: FolderRow[] }) {
  const t = useT("files");
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
      <form action={upload.run} className="grid gap-4">
        {/* 🚨 「ファイルを選択 / ファイル未選択」を画面に出さない（オーナー指摘）。
            素の input は FileDropzone の中に隠してある。 */}
        <FileDropzone name="file" />
        <select name="folder" className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc) md:text-sm" defaultValue="">
          <option value="">{t("no_folder_option")}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
        <Button type="submit" className="w-full md:w-fit" disabled={upload.pending}>
          <Upload />
          {t("upload_button")}
        </Button>
      </form>
    </div>
  );
}
