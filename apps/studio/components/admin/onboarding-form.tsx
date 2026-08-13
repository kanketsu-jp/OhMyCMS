"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
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
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        new_password: newPassword,
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
          <Label htmlFor="new-password">{t("new_password_label")}</Label>
          <InputGroup>
            <InputGroupInput
              id="new-password"
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? t("hide_password") : t("show_password")}
              >
                {showPassword ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <p className="text-xs text-muted-foreground">{t("new_password_help")}</p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="submit"
          className="min-h-(--control-h) w-full md:min-h-0"
          disabled={submit.pending || pending}
        >
          {pending ? t("submit_pending") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
