"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

export function PasswordLoginForm() {
  const router = useRouter();
  const t = useT("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = useSubmitOnce(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch(`/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      setError(t("auth_failed"));
      setPending(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  });

  return (
    <form onSubmit={submit.run} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label className="sr-only" htmlFor="email">
          {t("email_label")}
        </Label>
        <Input
          id="email"
          variant="entry"
          type="email"
          placeholder={t("email_label")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
        />
        <Label className="sr-only" htmlFor="password">
          {t("password_label")}
        </Label>
        <Input
          id="password"
          variant="entry"
          type="password"
          placeholder={t("password_label")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {/* 🚨 入口の画面なので `entry`（56px）。**操作が1つしかない画面に限る** */}
      <Button type="submit" size="entry" disabled={submit.pending || pending}>
        {pending ? t("sign_in_pending") : t("sign_in")}
      </Button>
    </form>
  );
}
