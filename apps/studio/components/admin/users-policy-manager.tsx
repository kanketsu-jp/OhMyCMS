"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, UserMinus } from "lucide-react";
import { FieldLabel } from "@/components/admin/field-label";
import { FormDraft } from "@/components/admin/form-draft";
import { ListEmpty } from "@/components/admin/list-empty";
import { WideTable } from "@/components/admin/wide-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Button } from "@/components/ui/button";
import { SurfaceDivider } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useFormSubmitShortcut } from "@/hooks/use-form-submit-shortcut";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromPayload } from "@/i18n/error";
import { AVATAR_EMOJIS } from "@/lib/admin/avatar-emojis";
import { identiconDataUri } from "@/lib/admin/identicon";

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  role: string | null;
  avatar_emoji: string | null;
};

type PolicyRow = {
  id: string;
  name: string;
};

type AccessRow = {
  id: string;
  role: string | null;
  user: string | null;
  policy: string;
  user_email?: string | null;
  role_name?: string | null;
  policy_name?: string | null;
};

type Props = {
  users: UserRow[];
  policies: PolicyRow[];
  access: AccessRow[];
};

export function UsersPolicyManager({ users, policies, access }: Props) {
  const router = useRouter();
  const t = useT("users");
  const tError = useT("errors");
  // 🚨 呼び出し側は変えない。中で code → 辞書の鍵に写すだけ。
  const messageFrom = (payload: unknown, fallback: string) => {
    const key = errorKeyFromPayload(payload);
    return key ? tError(key) : fallback;
  };
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const assignDisabled = users.length === 0 || policies.length === 0;
  const usersById = new Map(users.map((user) => [user.id, user]));

  const assign = useSubmitOnce(async (formData: FormData) => {
    setError(null);
    const body = {
      user: String(formData.get("user") ?? ""),
      policy: String(formData.get("policy") ?? ""),
    };
    const response = await fetch("/api/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_assign_failed")));
      return;
    }
    router.refresh();
  });

  const remove = useSubmitOnce(async (id: string) => {
    setError(null);
    const response = await fetch(`/api/access/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_remove_failed")));
      return;
    }
    toast.success(t("assignment_removed"));
    router.refresh();
  }, (id) => id);

  useFormSubmitShortcut("user-policy-assign-form", { pending: assign.pending, disabled: assignDisabled });

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {access.length === 0 ? (
        <ListEmpty>{t("empty")}</ListEmpty>
      ) : (
        // ユーザーとポリシーを別列で照合する一覧なので table にする。
        <WideTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("user_label")}</TableHead>
                <TableHead>{t("policy_label")}</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">{t("remove_button")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {access.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  // 行のどこを押しても開ける。行内のボタン・リンクを押したときは遷移しない。
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button, a")) return;
                    router.push(`/admin/settings/users/${row.user}`);
                  }}
                >
                  {/* 🚨 **利用者の行だけ**、1 件のページへ開ける
                      （`decisions/list-views-are-switchable-layouts` §3。**役割には 1 件のページが別に在る**）。
                      🚨 **役割の行をここからリンクしない**——**役割の一覧が別に在るのに、
                      同じものへの入口を 2 箇所に作ると、どちらが正か分からなくなる**。 */}
                  <TableCell className="font-medium">
                    {row.user ? (
                      <Link
                        href={`/admin/settings/users/${row.user}`}
                        className="inline-flex min-w-0 items-center gap-2 hover:underline"
                      >
                        <Avatar size="sm" aria-hidden="true">
                          {!usersById.get(row.user)?.avatar_emoji ? (
                            <AvatarImage src={identiconDataUri(row.user)} alt="" />
                          ) : null}
                          <AvatarFallback>
                            {usersById.get(row.user)?.avatar_emoji ?? AVATAR_EMOJIS[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{row.user_email ?? row.user}</span>
                      </Link>
                    ) : (
                      (row.role_name ?? row.role)
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t("policy_prefix", { policy: row.policy_name ?? row.policy })}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="destructive-ghost"
                        size="sm"
                        aria-label={t("remove_button")}
                        disabled={remove.isPending(row.id)}
                        onClick={() => setConfirming(row.id)}
                      >
                        {/* 🚨 ゴミ箱にしない。**割り当てを外す**操作で、ユーザーが消えるわけではない
                            （ゴミ箱だと「ユーザーごと消える」と誤解される。design ⑬） */}
                        <UserMinus />
                        <span className="hidden md:inline">{t("remove_button")}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </WideTable>
      )}
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
      <SurfaceDivider />
      <form id="user-policy-assign-form" action={assign.run} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <FormDraft formId="user-policy-assign-form" />
        <div className="space-y-1.5">
          <FieldLabel htmlFor="user" required>{t("user_label")}</FieldLabel>
          <select id="user" name="user" required className="h-(--control-h) w-full rounded-lg bg-input px-2 text-base md:h-(--control-h-pc-field) md:text-sm">
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.email}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="policy" required>{t("policy_label")}</FieldLabel>
          <select id="policy" name="policy" required className="h-(--control-h) w-full rounded-lg bg-input px-2 text-base md:h-(--control-h-pc-field) md:text-sm">
            {policies.map((policy) => (
              <option key={policy.id} value={policy.id}>{policy.name}</option>
            ))}
          </select>
        </div>
        {/* 🚨 選ぶものが無いなら押させない（憲章 §3c）。
            select が空だと送信しても中身が無く、サーバへ無意味な要求が飛ぶ。
            由来: `19e6f3c` でヘッダーへ移したとき、この判定を落としていた（saml が実測で検出）。 */}
        <Button type="submit" loading={assign.pending} disabled={assignDisabled}>
          <Plus />
          {t("assign_button")}
        </Button>
      </form>
    </div>
  );
}
