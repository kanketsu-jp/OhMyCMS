"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { InfoHint } from "@/components/admin/info-hint";

type MailTestResult = "idle" | "ok" | "failed" | "not_configured";

export function MailTestButton() {
  const t = useT("settings");
  const [result, setResult] = useState<MailTestResult>("idle");

  const test = useSubmitOnce(async () => {
    setResult("idle");
    const response = await fetch("/api/settings/mail-test", { method: "POST" });

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
