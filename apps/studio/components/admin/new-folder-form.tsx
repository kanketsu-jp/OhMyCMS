"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useState } from "react";

import { FormDraft } from "@/components/admin/form-draft";
import { PageAction } from "@/components/admin/page-action";
import { Input } from "@/components/ui/input";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

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

export function NewFolderForm({ parent }: { parent: string | null }) {
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
        parent,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(
        messageFrom(
          payload,
          response.status === 403 ? t("error_forbidden") : t("error_create_failed"),
        ),
      );
      return;
    }
    router.push(parent ? `/admin/files?folder=${parent}` : "/admin/files");
    router.refresh();
  });

  return (
    <form id="folder-create-form" action={create.run} className="flex flex-col gap-4">
      <FormDraft formId="folder-create-form" />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Input
        name="name"
        required
        placeholder={t("name_placeholder")}
        aria-label={t("name_label")}
      />
      <PageAction
        form="folder-create-form"
        role="primary"
        pending={create.pending}
        label={t("create_button")}
        icon={<Check />}
      />
    </form>
  );
}
