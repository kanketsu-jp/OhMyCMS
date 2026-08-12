"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

function messageFrom(payload: unknown, status: number, fallback: string): string {
  if (status === 409) return "中にファイルがあります";
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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function create(formData: FormData) {
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
      setError(messageFrom(payload, response.status, response.status === 403 ? "権限がありません" : "作成できません"));
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    setError(null);
    const response = await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status, response.status === 403 ? "権限がありません" : "削除できません"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <form action={create} className="grid gap-4 rounded-md border p-4 md:grid-cols-[1fr_220px_auto] md:items-end">
        <Input name="name" required placeholder="フォルダ名" />
        <select name="parent" className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm" defaultValue="">
          <option value="">親なし</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
        <Button type="submit">
          <FolderPlus />
          作成
        </Button>
      </form>
      <div className="divide-y rounded-md border">
        {folders.map((folder) => (
          <div key={folder.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium">{folder.name}</p>
              <p className="text-sm text-muted-foreground">親: {folders.find((item) => item.id === folder.parent)?.name ?? "なし"}</p>
            </div>
            <Button type="button" variant="destructive" size="sm" onClick={() => void remove(folder.id)}>
              <Trash2 />
              削除
            </Button>
          </div>
        ))}
        {folders.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">フォルダはまだありません。</p>
        ) : null}
      </div>
    </div>
  );
}
