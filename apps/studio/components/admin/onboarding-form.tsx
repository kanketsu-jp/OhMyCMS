"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useLocale, useT } from "@/i18n/client";
import { setLocaleAction } from "@/i18n/actions";
import { LOCALES } from "@/i18n/config";
import { cn } from "@/lib/utils";

type OnboardingFormProps = {
  defaultProjectName: string;
};

export function OnboardingForm({ defaultProjectName }: OnboardingFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useT("onboarding");
  const tCommon = useT("common");
  const [projectName, setProjectName] = useState(defaultProjectName);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = useSubmitOnce(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch(`/api/onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        admin_email: adminEmail,
        admin_password: adminPassword,
        project_name: projectName,
        default_locale: locale,
      }),
    });

    if (!response.ok) {
      setError(t("failed"));
      setPending(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p id="locale-label" className="text-sm font-medium">
          {t("locale_label")}
        </p>
        <form action={setLocaleAction}>
          <ButtonGroup aria-labelledby="locale-label" className="w-full">
            {LOCALES.map((loc) => {
              const selected = loc === locale;
              return (
                <button
                  key={loc}
                  type="submit"
                  name="locale"
                  value={loc}
                  aria-pressed={selected}
                  className={cn(
                    buttonVariants({ variant: selected ? "secondary" : "outline" }),
                    "min-h-(--control-h) md:min-h-(--control-h-pc) flex-1",
                  )}
                >
                  {tCommon(`locale_${loc}`)}
                  {selected ? <CheckIcon className="size-4" /> : null}
                </button>
              );
            })}
          </ButtonGroup>
        </form>
      </div>
      <hr className="border-0 border-t border-border" />
      <form onSubmit={submit.run} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-name">{t("project_name_label")}</Label>
          <Input
            id="project-name"
            type="text"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            required
            autoComplete="organization"
            className="h-(--control-h) md:h-(--control-h-pc)"
          />
          <p className="text-xs text-muted-foreground">{t("project_name_help")}</p>
        </div>
        <hr className="border-0 border-t border-border" />
        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-email">{t("admin_email_label")}</Label>
          <Input
            id="admin-email"
            type="email"
            value={adminEmail}
            onChange={(event) => setAdminEmail(event.target.value)}
            required
            autoComplete="email"
            className="h-(--control-h) md:h-(--control-h-pc)"
          />
          <Label htmlFor="admin-password">{t("admin_password_label")}</Label>
          <Input
            id="admin-password"
            type="password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="h-(--control-h) md:h-(--control-h-pc)"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="min-h-(--control-h) w-full md:min-h-0" disabled={submit.pending || pending}>
          {pending ? t("submit_pending") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
