"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/admin/info-hint";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

type MailTestResult = "idle" | "ok" | "failed" | "not_configured";

export function MailTestButton() {
  const t = useT("settings");
  const [result, setResult] = useState<MailTestResult>("idle");

  const test = useSubmitOnce(async () => {
    setResult("idle");
    const form = document.getElementById("settings-form");
    const values = form instanceof HTMLFormElement ? new FormData(form) : null;
    const response = await fetch("/api/settings/mail-test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        smtp_host: values?.get("smtp_host") ?? undefined,
        smtp_port: values?.get("smtp_port") ?? undefined,
        smtp_user: values?.get("smtp_user") ?? undefined,
        smtp_password: values?.get("smtp_password") ?? undefined,
      }),
    });

    if (response.ok) {
      setResult("ok");
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: string } }
      | null;
    setResult(payload?.error?.code === "MAIL_NOT_CONFIGURED" ? "not_configured" : "failed");
  });

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" onClick={() => void test.run()} disabled={test.pending}>
        {test.pending ? t("mail_testing") : t("mail_test")}
      </Button>
      <InfoHint sectionId="panel-section-mail-test" />
      {result === "ok" ? (
        <span className="text-sm text-muted-foreground">{t("mail_test_ok")}</span>
      ) : null}
      {result === "failed" ? (
        <span className="text-sm text-destructive">{t("mail_test_failed")}</span>
      ) : null}
      {result === "not_configured" ? (
        <span className="text-sm text-muted-foreground">{t("mail_not_configured")}</span>
      ) : null}
    </div>
  );
}
