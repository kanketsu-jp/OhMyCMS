"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function upload(formData: FormData) {
    setError(null);
    const response = await fetch("/api/files", { method: "POST", body: formData });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(messageFrom(payload, response.status === 403 ? "権限がありません" : "アップロードできません"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <form action={upload} className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
        <Input name="file" type="file" required />
        <select name="folder" className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm" defaultValue="">
          <option value="">フォルダなし</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
        <Button type="submit">
          <Upload />
          アップロード
        </Button>
      </form>
    </div>
  );
}
