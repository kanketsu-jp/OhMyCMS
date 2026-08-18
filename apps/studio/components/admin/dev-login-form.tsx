"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { errorKeyFromPayload } from "@/i18n/error";
import { FieldLabel } from "@/components/admin/field-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useSubmitOnce } from "@/hooks/use-submit-once";

/**
 * 開発用ログインの入力フォーム。開発環境の認証確認用で、通常のログイン画面とは別経路。
 *
 * 🚨 API の生エラー文言を画面へ出さず、`errorKeyFromPayload` から辞書へ写すこと。
 * 送信処理は二重送信防止の `useSubmitOnce` の中に置く。
 *
 * 参考: `apps/studio/components/admin/password-login-form.tsx` ／ `apps/studio/i18n/error.ts`
 */

export function DevLoginForm() {
  const router = useRouter();
  const t = useT("auth");
  const tError = useT("errors");
  const [email, setEmail] = useState("admin@local");
  const [admin, setAdmin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = useSubmitOnce(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch(`/api/auth/dev-login${admin ? "?admin=true" : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      // 🚨 型からも message を外す（読める形が在ると、また書かれる）。
      const payload = await response.json().catch(() => null) as {
        error?: { code?: string };
      } | null;
      // 🚨 API の生文言を画面へ出さない。code を鍵へ写して辞書から出す。
      //    生文言は lib/ に直書きされた日本語なので、英語で見ている人の画面にも日本語が出る。
      //    表に無い code は「予期しないエラー」ではなく、この画面の具体的な文言へ落とす。
      // 🚨 取り出しは `i18n/error.ts` の 1 本に寄せてある（2026-08-17・files が作った寄せ先）。
      //    ここで自前に組み直さない——**同じ処理が 10 箇所に散っていた**のを畳んだところ。
      //    `null` は「表に無い code」で、以前の `FALLBACK_ERROR_KEY` と同じ意味
      //    （寄せ先が「表に無ければ null」に畳んでいる。分岐は 1 文字も変えていない）。
      const key = errorKeyFromPayload(payload);
      setError(
        key === null ? t("login_failed", { status: response.status }) : tError(key),
      );
      setPending(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  });

  return (
    <form onSubmit={submit.run} className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="dev-email" required>{t("email_label")}</FieldLabel>
        <Input
          id="dev-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <label className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
        <Checkbox
          checked={admin}
          onCheckedChange={(checked) => setAdmin(checked === true)}
        />
        {t("admin_checkbox")}
      </label>
      {error ? <p className="text-base text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={submit.pending || pending}>
        {pending ? t("dev_login_pending") : t("dev_login")}
      </Button>
    </form>
  );
}
