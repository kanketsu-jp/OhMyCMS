"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

type FileRow = {
  id: string;
  title: string | null;
  description: string | null;
  tags: string | null;
  folder: string | null;
};

type FolderRow = {
  id: string;
  name: string;
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

export function FileDetailManager({ file, folders }: { file: FileRow; folders: FolderRow[] }) {
  const t = useT("files");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const save = useSubmitOnce(async (formData: FormData) => {
    setError(null);
    const body = {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      tags: String(formData.get("tags") ?? ""),
      folder: String(formData.get("folder") ?? "") || null,
    };
    const response = await fetch(`/api/files/${file.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_save_failed")));
      return;
    }
    router.refresh();
  });

  const remove = useSubmitOnce(async () => {
    setError(null);
    const response = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_delete_failed")));
      return;
    }
    router.push("/admin/files");
    router.refresh();
  });

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <form id="file-detail-form" action={save.run} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">{t("title_label")}</Label>
          <Input id="title" name="title" defaultValue={file.title ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">{t("description_label")}</Label>
          <textarea id="description" name="description" defaultValue={file.description ?? ""} className="min-h-28 w-full rounded-lg bg-muted/60 px-2.5 py-2 text-base md:text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tags">{t("tags_label")}</Label>
          <Input id="tags" name="tags" defaultValue={file.tags ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="folder">{t("folder_label")}</Label>
          <select id="folder" name="folder" className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm" defaultValue={file.folder ?? ""}>
            <option value="">{t("no_folder_option")}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={save.pending}>
            <Save />
            {t("save_button")}
          </Button>
          <Button type="button" variant="destructive" disabled={remove.pending} onClick={() => void remove.run()}>
            <Trash2 />
            {t("delete_button")}
          </Button>
        </div>
      </form>
    </div>
  );
}
