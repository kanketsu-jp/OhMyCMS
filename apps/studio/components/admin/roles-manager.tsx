"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { FormDraft } from "@/components/admin/form-draft";
import { PageAction } from "@/components/admin/page-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";

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
  const t = useT("roles");
  const [error, setError] = useState<string | null>(null);

  const create = useSubmitOnce(async (formData: FormData) => {
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
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_create_failed")));
      return;
    }
    router.refresh();
  });

  const remove = useSubmitOnce(async (id: string) => {
    setError(null);
    const response = await fetch(`/api/roles/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_remove_failed")));
      return;
    }
    toast.success(t("deleted"));
    router.refresh();
  }, (id) => id);

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <form id="role-create-form" action={create.run} className="grid gap-4 md:grid-cols-[1fr_1fr_220px_auto] md:items-end">
        <FormDraft formId="role-create-form" />
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("name_label")}</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">{t("description_label")}</Label>
          <Input id="description" name="description" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="parent">{t("parent_label")}</Label>
          <select id="parent" name="parent" className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm">
            <option value="">{t("none_option")}</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </div>
        <PageAction
          form="role-create-form"
          role="primary"
          pending={create.pending}
          label={t("create_button")}
          icon={<Plus />}
        />
      </form>
      <div className="divide-y border-t">
        {roles.map((role) => (
          <div key={role.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-medium">{role.name}</p>
              <p className="text-sm text-muted-foreground">
                {role.description || t("no_description")} / {t("parent_colon_label")}{roles.find((item) => item.id === role.parent)?.name ?? t("none_option")}
              </p>
            </div>
            <Button type="button" variant="destructive-ghost" size="sm" aria-label={t("delete_button")} disabled={remove.isPending(role.id)} onClick={() => void remove.run(role.id)}>
              <Trash2 />
              <span className="hidden md:inline">{t("delete_button")}</span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
