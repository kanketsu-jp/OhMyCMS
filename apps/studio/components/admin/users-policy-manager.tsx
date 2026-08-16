"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserMinus } from "lucide-react";
import { FormDraft } from "@/components/admin/form-draft";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromApiCode, FALLBACK_ERROR_KEY, type ErrorKey } from "@/i18n/error";

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  role: string | null;
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

export function UsersPolicyManager({ users, policies, access }: Props) {
  const router = useRouter();
  const t = useT("users");
  const tError = useT("errors");
  // 🚨 呼び出し側は変えない。中で code → 辞書の鍵に写すだけ。
  const messageFrom = (payload: unknown, fallback: string) => {
    const key = errorKeyFrom(payload);
    return key ? tError(key) : fallback;
  };
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {/* ユーザーとポリシーを別列で照合する一覧なので table にする。 */}
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
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.user_email ?? row.role_name ?? row.user ?? row.role}</TableCell>
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
                    onClick={() => void remove.run(row.id)}
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
      {access.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : null}
      <form id="user-policy-assign-form" action={assign.run} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <FormDraft formId="user-policy-assign-form" />
        <div className="space-y-1.5">
          <label htmlFor="user" className="text-sm font-medium">{t("user_label")}</label>
          <select id="user" name="user" required className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm">
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.email}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="policy" className="text-sm font-medium">{t("policy_label")}</label>
          <select id="policy" name="policy" required className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm">
            {policies.map((policy) => (
              <option key={policy.id} value={policy.id}>{policy.name}</option>
            ))}
          </select>
        </div>
        {/* 🚨 選ぶものが無いなら押させない（憲章 §3c）。
            select が空だと送信しても中身が無く、サーバへ無意味な要求が飛ぶ。
            由来: `19e6f3c` でヘッダーへ移したとき、この判定を落としていた（saml が実測で検出）。 */}
        <Button type="submit" loading={assign.pending} disabled={users.length === 0 || policies.length === 0}>
          <Plus />
          {t("assign_button")}
        </Button>
      </form>
    </div>
  );
}
