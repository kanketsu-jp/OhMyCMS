"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

export function OtpLoginForm() {
  const router = useRouter();
  const t = useT("auth");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const requestCode = useSubmitOnce(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setPending(false);
    if (!response.ok) {
      setError(t("otp_failed"));
      return;
    }

    // 🚨 **初期設定が終わっていない間だけ**、サーバが `diagnosis` を返す（正直な理由）。
    //    そのときは**コード入力へ進めない**——進めると「6 桁を入れてください」と出て、
    //    来ないメールを待たせる形が残る。
    //    🚨 初期設定が済んだあとは `diagnosis` が**付かない**ので、下の「送りました」だけになる
    //    （＝ 列挙対策は元のまま。ここに条件を足して揃えに来ないこと）。
    const payload = (await response.json().catch(() => null)) as
      | { data?: { requested?: boolean; diagnosis?: string } }
      | null;
    const diagnosis = payload?.data?.diagnosis;
    if (diagnosis && diagnosis !== "sent") {
      setError(
        diagnosis === "no-account"
          ? t("otp_setup_no_account")
          : diagnosis === "mail-not-configured"
            ? t("otp_setup_mail_not_configured")
            : t("otp_setup_rate_limited"),
      );
      return;
    }

    // 🚨 「送りました」とだけ表示する。存在の有無は出さない。
    setStage("code");
  });

  const verifyCode = useSubmitOnce(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    if (!response.ok) {
      setError(t("otp_failed"));
      setPending(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  });

  if (stage === "email") {
    return (
      <form onSubmit={requestCode.run} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="otp-email">{t("otp_email_label")}</Label>
          <Input
            id="otp-email"
            type="email"
            variant="entry"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="submit"
          size="entry"
          disabled={requestCode.pending || pending}
        >
          {pending ? t("otp_sending") : t("otp_send_code")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode.run} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("otp_sent")}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="otp-code">{t("otp_code_label")}</Label>
        <Input
          id="otp-code"
          type="text"
          variant="entry"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">{t("otp_code_help")}</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="submit"
        size="entry"
        disabled={verifyCode.pending || pending}
      >
        {pending ? t("otp_verifying") : t("otp_verify")}
      </Button>
    </form>
  );
}
