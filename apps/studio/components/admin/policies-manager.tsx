"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
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
  const t = useT("policies");
  const [error, setError] = useState<string | null>(null);

  const create = useSubmitOnce(async (formData: FormData) => {
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
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_create_failed")));
      return;
    }
    router.refresh();
  });

  const remove = useSubmitOnce(async (id: string) => {
    setError(null);
    const response = await fetch(`/api/policies/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_delete_failed")));
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
      <form id="policy-create-form" action={create.run} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("name_label")}</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">{t("description_label")}</Label>
            <Input id="description" name="description" />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
            <input type="checkbox" name="app_access" value="true" defaultChecked className="size-4" />
            {t("app_access_label")}
          </label>
          <label className="flex min-h-(--control-h) items-start gap-2 text-sm md:min-h-(--control-h-pc)">
            <input type="checkbox" name="admin_access" value="true" className="mt-0.5 size-4" />
            <span>
              {t("admin_access_label")}
              <span className="ml-2 text-destructive">{t("admin_access_warning")}</span>
            </span>
          </label>
        </div>
        <Button type="submit" disabled={create.pending}>{t("create_button")}</Button>
      </form>
      <div className="divide-y border-t">
        {policies.map((policy) => (
          <div key={policy.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium">
                {policy.name}
                {policy.admin_access ? <ShieldAlert className="size-4 text-destructive" /> : null}
              </p>
              <p className="text-sm text-muted-foreground">{policy.description || t("no_description")}</p>
            </div>
            <div className="flex gap-2">
              <Link href={`/admin/settings/policies/${policy.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                {t("edit_permissions_link")}
              </Link>
              <Button type="button" variant="destructive-ghost" size="sm" aria-label={t("delete_button")} disabled={remove.isPending(policy.id)} onClick={() => void remove.run(policy.id)}>
                <Trash2 />
                <span className="hidden md:inline">{t("delete_button")}</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
