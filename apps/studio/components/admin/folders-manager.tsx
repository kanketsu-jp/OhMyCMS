"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

function messageFrom(payload: unknown, status: number, fallback: string): string {
  // 409 はサーバも日本語の固定文言を返すため、UI 側の辞書を優先する。
  // (移植元も status で短絡していた。ここを payload 優先にすると英語表示時に日本語が出る)
  if (status === 409) return fallback;
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

export function FoldersManager({ folders }: { folders: FolderRow[] }) {
  const t = useT("folders");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const create = useSubmitOnce(async (formData: FormData) => {
    setError(null);
    const response = await fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        parent: String(formData.get("parent") ?? "") || null,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(messageFrom(payload, response.status, response.status === 403 ? t("error_forbidden") : t("error_create_failed")));
      return;
    }
    router.refresh();
  });

  const remove = useSubmitOnce(async (id: string) => {
    setError(null);
    const response = await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status, response.status === 409 ? t("error_folder_not_empty") : response.status === 403 ? t("error_forbidden") : t("error_delete_failed")));
      return;
    }
    router.refresh();
  }, (id) => id);

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <form action={create.run} className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
        <Input name="name" required placeholder={t("name_placeholder")} />
        <select name="parent" className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc) md:text-sm" defaultValue="">
          <option value="">{t("no_parent_option")}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
        <Button type="submit" disabled={create.pending}>
          <FolderPlus />
          {t("create_button")}
        </Button>
      </form>
      <div className="divide-y border-t">
        {folders.map((folder) => (
          <div key={folder.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium">{folder.name}</p>
              <p className="text-sm text-muted-foreground">{t("parent_label", { name: folders.find((item) => item.id === folder.parent)?.name ?? t("none_value") })}</p>
            </div>
            <Button type="button" variant="destructive-ghost" size="sm" disabled={remove.isPending(folder.id)} onClick={() => void remove.run(folder.id)}>
              <Trash2 />
              {t("delete_button")}
            </Button>
          </div>
        ))}
        {folders.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{t("empty_folders")}</p>
        ) : null}
      </div>
    </div>
  );
}
