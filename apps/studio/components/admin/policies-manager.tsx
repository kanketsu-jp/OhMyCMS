"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { FieldLabel } from "@/components/admin/field-label";
import { FormDraft } from "@/components/admin/form-draft";
import { ListEmpty } from "@/components/admin/list-empty";
import { PageAction } from "@/components/admin/page-action";
import { RowOptions } from "@/components/admin/row-options";
import { WideTable } from "@/components/admin/wide-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SurfaceDivider } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useFormSubmitShortcut } from "@/hooks/use-form-submit-shortcut";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromPayload } from "@/i18n/error";
import { cn } from "@/lib/utils";

export type PolicyRow = {
  id: string;
  name: string;
  description: string | null;
  app_access: boolean;
  admin_access: boolean;
};

export function PoliciesManager({ policies, tab }: { policies: PolicyRow[]; tab: "list" | "create" }) {
  const router = useRouter();
  const t = useT("policies");
  const tError = useT("errors");
  // 🚨 呼び出し側は変えない。中で code → 辞書の鍵に写すだけ。
  const messageFrom = (payload: unknown, fallback: string) => {
    const key = errorKeyFromPayload(payload);
    return key ? tError(key) : fallback;
  };
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [name, setName] = useState("");

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
      {tab === "list" && policies.length === 0 ? (
        <ListEmpty>{t("empty")}</ListEmpty>
      ) : tab === "list" ? (
        // 名前・説明・アクセス種別・操作の複数列を読む一覧なので table にする。
        <WideTable>
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
                    <ButtonGroup className="ml-auto justify-end [&>*]:rounded-none">
                      <Link href={`/admin/settings/policies/${policy.id}`} className={cn(buttonVariants({ variant: "outline" }))}>
                        {t("edit_permissions_link")}
                      </Link>
                      <RowOptions
                        label={t("row_options")}
                        options={[
                          ...(policy.name === "Administrator"
                            ? []
                            : [
                                {
                                  label: t("delete_button"),
                                  icon: <Trash2 />,
                                  destructive: true,
                                  disabled: remove.isPending(policy.id),
                                  onSelect: () => setConfirming(policy.id),
                                },
                              ]),
                        ]}
                      />
                    </ButtonGroup>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </WideTable>
      ) : null}
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete_confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              tone="danger"
              loading={confirming !== null && remove.isPending(confirming)}
              onClick={() => {
                if (confirming === null) return;
                void remove.run(confirming);
                setConfirming(null);
              }}
            >
              {t("delete_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {tab === "create" ? (
        <>
          <SurfaceDivider />
          <PageAction
            form="policy-create-form"
            role="primary"
            label={t("create_button")}
            icon={<Plus />}
            disabled={!name.trim()}
          />
          <form id="policy-create-form" action={create.run} className="space-y-4">
            <FormDraft formId="policy-create-form" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="name" required>{t("name_label")}</FieldLabel>
                <Input id="name" name="name" required value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">{t("description_label")}</Label>
                <Input id="description" name="description" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
                <Checkbox name="app_access" value="true" defaultChecked />
                {t("app_access_label")}
              </label>
              <label className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
                <Checkbox name="admin_access" value="true" />
                <span className="flex flex-wrap items-center gap-2">
                  {t("admin_access_label")}
                  <span className="text-destructive">{t("admin_access_warning")}</span>
                </span>
              </label>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}
