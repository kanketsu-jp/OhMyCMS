"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";

type MailStatus = "skipped" | "sent" | "failed";

/**
 * 不具合の報告フォーム（F2 §2-G）。
 *
 * 🚨 **自動で送るのは「いま開いている画面のパス」だけ。**
 *    Cookie もトークンも設定値も送らない。何を送るかを画面に明記してあるのは、
 *    利用者が本文に秘密を書かないよう促すためでもある。
 *
 * 送信結果は3通りある。**メール未設定は失敗ではない**ので、そう見えるように書き分ける。
 */
export function BugReportForm() {
  const t = useT("reports");
  const pathname = usePathname();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MailStatus | null>(null);

  async function submit(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();

    if (!title) return setError(t("error_title_required"));
    if (!body) return setError(t("error_body_required"));

    setSubmitting(true);
    setError(null);
    setResult(null);

    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // 🚨 送るのはこの3つだけ。ヘッダも設定値も足さない。
      body: JSON.stringify({ title, body, page_path: pathname }),
    });
    setSubmitting(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(payload?.error?.message ?? t("error_submit_failed"));
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | { data?: { mail_status?: MailStatus } }
      | null;
    setResult(payload?.data?.mail_status ?? "skipped");
  }

  if (result) {
    return (
      <div className="space-y-2 rounded-lg border px-3 py-3 text-sm">
        <p>{t("submitted")}</p>
        <p className="text-xs text-muted-foreground">
          {result === "sent"
            ? t("mail_sent")
            : result === "failed"
              ? t("mail_failed")
              : t("mail_skipped")}
        </p>
      </div>
    );
  }

  return (
    <form action={submit} className="max-w-2xl space-y-4">
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="report-title">{t("report_title_label")}</Label>
        <Input
          id="report-title"
          name="title"
          placeholder={t("report_title_placeholder")}
          maxLength={255}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="report-body">{t("report_body_label")}</Label>
        <textarea
          id="report-body"
          name="body"
          rows={8}
          maxLength={20000}
          placeholder={t("report_body_placeholder")}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
        />
      </div>

      <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {t("privacy_note")}
      </p>

      <Button type="submit" disabled={submitting}>
        {submitting ? t("submitting") : t("submit_button")}
      </Button>
    </form>
  );
}
