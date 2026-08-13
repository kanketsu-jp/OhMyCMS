"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitOnce } from "@/hooks/use-submit-once";

export function DevLoginForm() {
  const router = useRouter();
  const t = useT("auth");
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
      const payload = await response.json().catch(() => null) as {
        error?: { message?: string };
      } | null;
      setError(payload?.error?.message ?? t("login_failed", { status: response.status }));
      setPending(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  });

  return (
    <form onSubmit={submit.run} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="dev-email">{t("email_label")}</Label>
        <Input
          id="dev-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 rounded border-input"
          checked={admin}
          onChange={(event) => setAdmin(event.target.checked)}
        />
        {t("admin_checkbox")}
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={submit.pending || pending}>
        {pending ? t("dev_login_pending") : t("dev_login")}
      </Button>
    </form>
  );
}
