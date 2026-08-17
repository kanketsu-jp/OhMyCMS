"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { FormDraft } from "@/components/admin/form-draft";
import { ListEmpty } from "@/components/admin/list-empty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";
import { errorKeyFromApiCode, FALLBACK_ERROR_KEY, type ErrorKey } from "@/i18n/error";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useFormSubmitShortcut } from "@/hooks/use-form-submit-shortcut";
import { useSubmitOnce } from "@/hooks/use-submit-once";

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  parent: string | null;
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

export function RolesManager({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const t = useT("roles");
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

  useFormSubmitShortcut("role-create-form", { pending: create.pending });

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {/* 名前・説明・親ロール・操作の複数列を読む一覧なので table にする。 */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name_label")}</TableHead>
            <TableHead>{t("description_label")}</TableHead>
            <TableHead>{t("parent_label")}</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">{t("delete_button")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow
              key={role.id}
              className="cursor-pointer"
              // 行のどこを押しても開ける。行内のボタン・リンクを押したときは遷移しない。
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a")) return;
                router.push(`/admin/settings/roles/${role.id}`);
              }}
            >
              {/* 🚨 一覧から 1 件へ開ける（`decisions/list-views-are-switchable-layouts` §3）。
                  名前をリンクにするのは `files-table` と同じ形——**行の識別子が入口**。 */}
              <TableCell className="font-medium">
                <Link href={`/admin/settings/roles/${role.id}`} className="hover:underline">
                  {role.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{role.description || t("no_description")}</TableCell>
              <TableCell>
                {t("parent_colon_label")}
                {roles.find((item) => item.id === role.parent)?.name ?? t("none_option")}
              </TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="sm"
                    aria-label={t("delete_button")}
                    disabled={remove.isPending(role.id)}
                    onClick={() => void remove.run(role.id)}
                  >
                    <Trash2 />
                    <span className="hidden md:inline">{t("delete_button")}</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* 1 件も無いことを、表の枠だけで伝えない。
          （読み込めていないのか、まだ無いのかが分からない） */}
      {roles.length === 0 ? (
        <ListEmpty>{t("empty")}</ListEmpty>
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
        <Button type="submit" loading={create.pending}>
          <Plus />
          {t("create_button")}
        </Button>
      </form>
    </div>
  );
}
