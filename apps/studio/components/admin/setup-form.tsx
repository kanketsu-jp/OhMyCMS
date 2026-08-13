"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

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
        <Label htmlFor="setup-password">{t("password_label")}</Label>
        <Input
          id="setup-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
          className="h-(--control-h) md:h-(--control-h-pc)"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="min-h-(--control-h) w-full md:min-h-0" disabled={submit.pending || pending}>
        {pending ? t("sign_in_pending") : t("sign_in")}
      </Button>
    </form>
  );
}
