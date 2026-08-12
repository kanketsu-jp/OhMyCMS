"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type PolicyRow = {
  id: string;
  name: string;
  description: string | null;
  app_access: boolean;
  admin_access: boolean;
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

export function PoliciesManager({ policies }: { policies: PolicyRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function create(formData: FormData) {
    setError(null);
    const body = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      app_access: formData.get("app_access") === "true",
      admin_access: formData.get("admin_access") === "true",
    };
    const response = await fetch("/api/policies", {
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
    const response = await fetch(`/api/policies/${id}`, { method: "DELETE" });
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
      <form action={create} className="space-y-4 rounded-md border p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">ポリシー名</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">説明</Label>
            <Input id="description" name="description" />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="app_access" value="true" defaultChecked className="size-4" />
            管理アプリへアクセス
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="admin_access" value="true" className="mt-0.5 size-4" />
            <span>
              管理者アクセス
              <span className="ml-2 text-destructive">全権限を持ちます。取り扱い注意</span>
            </span>
          </label>
        </div>
        <Button type="submit">作成</Button>
      </form>
      <div className="divide-y rounded-md border">
        {policies.map((policy) => (
          <div key={policy.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium">
                {policy.name}
                {policy.admin_access ? <ShieldAlert className="size-4 text-destructive" /> : null}
              </p>
              <p className="text-sm text-muted-foreground">{policy.description || "説明なし"}</p>
            </div>
            <div className="flex gap-2">
              <Link href={`/admin/settings/policies/${policy.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                permission編集
              </Link>
              <Button type="button" variant="destructive" size="sm" onClick={() => void remove(policy.id)}>
                <Trash2 />
                削除
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
