"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { FileDropzone } from "@/components/admin/file-dropzone";
import { toast } from "@/components/ui/toast";
import { PageAction } from "@/components/admin/page-action";
import { Input } from "@/components/ui/input";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromPayload } from "@/i18n/error";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

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
    const key = errorKeyFromPayload(payload);
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
    // 🚨 **成功を伝えて、一覧へ戻る。** ここが `router.refresh()` だけだったせいで、
    //   **201 が返っているのに画面が 1 mm も変わらなかった**（storage が :3102 で再現・2026-08-17）。
    //   利用者は「何も起きていない」と読んで**もう一度押す**。そのとき React 19 は
    //   action の後にフォームを reset しているので、**入力欄は空**——それでも
    //   `FileDropzone` は自分の state でファイル名を出し続けるため、**選ばれているように見える**。
    //   ＝ 🚨 **中身の無いファイルが無言で増える**（実測: filesize 0・filename_download 空）。
    //   → `decisions/toast-for-events-page-for-what-needs-fixing`「終わったことはトーストへ」。
    //   🚨 **遷移も要る**。同じ `/admin/files/new` に留まると、成功しても見た目が変わらないので、
    //     トーストだけでは「もう一度押す」を止めきれない。**一覧へ移れば、上がったものが見える**。
    //     🚨 遷移すると `FileDropzone` が unmount されるので、**残っていた選択表示も消える**。
    toast.success(t("uploaded"));
    const folder = String(formData.get("folder") ?? "");
    router.push(folder ? `/admin/files?folder=${encodeURIComponent(folder)}` : "/admin/files");
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
        <Input
          name="filename"
          placeholder={t("filename_help")}
          aria-label={t("filename_label")}
        />
        <select name="folder" className="h-(--control-h) w-full rounded-lg bg-input px-2 text-base md:h-(--control-h-pc-field) md:text-sm" defaultValue={initialFolder === "root" ? "" : initialFolder ?? ""}>
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
