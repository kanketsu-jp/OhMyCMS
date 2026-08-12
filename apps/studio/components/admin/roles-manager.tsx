"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
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

export function RolesManager({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function create(formData: FormData) {
    setError(null);
    const body = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      parent: String(formData.get("parent") ?? "") || null,
    };
    const response = await fetch("/api/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(messageFrom(payload, response.status === 403 ? "権限がありません" : "作成できません"));
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    setError(null);
    const response = await fetch(`/api/roles/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? "権限がありません" : "削除できません"));
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
      <form action={create} className="grid gap-4 md:grid-cols-[1fr_1fr_220px_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="name">ロール名</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">説明</Label>
          <Input id="description" name="description" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="parent">親ロール</Label>
          <select id="parent" name="parent" className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">
            <option value="">なし</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </div>
        <Button type="submit">作成</Button>
      </form>
      <div className="divide-y rounded-md border">
        {roles.map((role) => (
          <div key={role.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-medium">{role.name}</p>
              <p className="text-sm text-muted-foreground">
                {role.description || "説明なし"} / 親: {roles.find((item) => item.id === role.parent)?.name ?? "なし"}
              </p>
            </div>
            <Button type="button" variant="destructive" size="sm" onClick={() => void remove(role.id)}>
              <Trash2 />
              削除
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
