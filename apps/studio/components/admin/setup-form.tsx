"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel } from "@/components/admin/field-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

/**
 * 初回セットアップ用のパスワード入力フォーム。
 *
 * 🚨 認証画面の表示文言は `auth` 辞書を通す。API の生エラーは表示せず、失敗時は固定キーにする。
 *
 * 参考: DESIGN.md §0-1・§1-8 ／ `i18n/messages/ja/auth.json` ／ `i18n/messages/en/auth.json`
 */
export function SetupForm() {
  const router = useRouter();
  const t = useT("auth");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = useSubmitOnce(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch(`/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      setError(t("auth_failed"));
      setPending(false);
      return;
    }

    router.push("/onboarding");
    router.refresh();
  });

  return (
    <form onSubmit={submit.run} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {/* ラベルは可視で置く（design 確定）。プレースホルダだけだと
            入力を始めた瞬間に何の欄か分からなくなる。 */}
        <FieldLabel htmlFor="setup-password" required>{t("password_label")}</FieldLabel>
        <Input
          id="setup-password"
          type="password"
          variant="entry"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {error ? <p className="text-base text-destructive">{error}</p> : null}
      <Button type="submit" size="entry" disabled={submit.pending || pending}>
        {pending ? t("sign_in_pending") : t("sign_in")}
      </Button>
    </form>
  );
}
