"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useState } from "react";

import { FormDraft } from "@/components/admin/form-draft";
import { PageAction } from "@/components/admin/page-action";
import { Input } from "@/components/ui/input";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromApiCode, FALLBACK_ERROR_KEY, type ErrorKey } from "@/i18n/error";

/**
 * 🚨 **API の生文言を画面へ出さない。** code だけを見て辞書の鍵へ写す。
 *    生文言は `lib/` に直書きされた日本語なので、**英語で見ている人の画面にも日本語が出る**。
 *    表に無い code は `null` を返し、呼び出し側の具体的な文言を使う
 *    （`unexpected`「予期しないエラー」より、その場の文言のほうが正確なため）。
 */
function errorKeyFrom(payload: unknown): ErrorKey | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "code" in payload.error &&
    typeof payload.error.code === "string"
  ) {
    const key = errorKeyFromApiCode(payload.error.code);
    return key === FALLBACK_ERROR_KEY ? null : key;
  }
  return null;
}

export function NewFolderForm({ parent }: { parent: string | null }) {
  const t = useT("folders");
  const tError = useT("errors");
  const messageFrom = (payload: unknown, fallback: string) => {
    const key = errorKeyFrom(payload);
    return key ? tError(key) : fallback;
  };
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
