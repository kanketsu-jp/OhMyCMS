"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { FormDraft } from "@/components/admin/form-draft";
import { RowOptions } from "@/components/admin/row-options";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useFormSubmitShortcut } from "@/hooks/use-form-submit-shortcut";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromApiCode, FALLBACK_ERROR_KEY, type ErrorKey } from "@/i18n/error";
import { cn } from "@/lib/utils";

export type PolicyRow = {
  id: string;
  name: string;
  description: string | null;
  app_access: boolean;
  admin_access: boolean;
};

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

export function PoliciesManager({ policies }: { policies: PolicyRow[] }) {
  const router = useRouter();
  const t = useT("policies");
  const tError = useT("errors");
  // 🚨 呼び出し側は変えない。中で code → 辞書の鍵に写すだけ。
  const messageFrom = (payload: unknown, fallback: string) => {
    const key = errorKeyFrom(payload);
    return key ? tError(key) : fallback;
  };
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
    toast.success(t("deleted"));
    router.refresh();
  }, (id) => id);

  useFormSubmitShortcut("policy-create-form", { pending: create.pending });

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {/* 名前・説明・アクセス種別・操作の複数列を読む一覧なので table にする。 */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name_label")}</TableHead>
            <TableHead>{t("description_label")}</TableHead>
            <TableHead>{t("app_access_label")}</TableHead>
            <TableHead>{t("admin_access_label")}</TableHead>
            <TableHead className="text-right">{t("action_label")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((policy) => (
            <TableRow
              key={policy.id}
              className="cursor-pointer"
              // 行のどこを押しても開ける。行内のボタン・リンクを押したときは遷移しない。
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a")) return;
                router.push(`/admin/settings/policies/${policy.id}`);
              }}
            >
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  {policy.name}
                  {policy.admin_access ? <ShieldAlert className="size-4 text-destructive" /> : null}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">{policy.description || t("no_description")}</TableCell>
              <TableCell>{policy.app_access ? t("app_access_label") : null}</TableCell>
              <TableCell>{policy.admin_access ? t("admin_access_label") : null}</TableCell>
              <TableCell>
                {/* 🚨 行の操作が 2 つ以上なら、破壊的なほうは ▾ の中へ
                    （`knowledge/decisions/action-button-and-edit-mode.md`。283 A を行へ延ばしたもの）。
                    形はゴミ箱（`trash-manager.tsx`）に合わせている。新しい形を作らない。 */}
                <div className="flex justify-end gap-1">
                  <Link href={`/admin/settings/policies/${policy.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    {t("edit_permissions_link")}
                  </Link>
                  <RowOptions
                    label={t("row_options")}
                    options={[
                      {
                        label: t("delete_button"),
                        icon: <Trash2 />,
                        destructive: true,
                        disabled: remove.isPending(policy.id),
                        onSelect: () => void remove.run(policy.id),
                      },
                    ]}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <form id="policy-create-form" action={create.run} className="space-y-4">
        <FormDraft formId="policy-create-form" />
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
        <Button type="submit" loading={create.pending}>
          <Plus />
          {t("create_button")}
        </Button>
      </form>
    </div>
  );
}
