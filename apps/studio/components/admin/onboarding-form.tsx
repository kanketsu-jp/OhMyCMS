"use client";

import Link from "next/link";
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
  const [tenantName, setTenantName] = useState("");
  const [logoId, setLogoId] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<"form" | "done">("form");

  // 🚨 アップロードも「変更を送る」操作なので useSubmitOnce を通す。
  //    `logoUploading`（useState）では防げない——**setState は非同期**で、
  //    再レンダーが走る前に2回目が通る（憲章 §5b）。
  //    🚨 finally を外さないこと。早期 return があると inFlight が残り、
  //    **二度とアップロードできなくなる**（前任が実測で踏んでいる）。
  const uploadLogo = useSubmitOnce(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLogoError(null);
    setLogoUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/onboarding/logo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setLogoError(t("logo_failed"));
        return;
      }

      const payload = (await response.json()) as { data: { id: string } };
      setLogoId(payload.data.id);
      setLogoPreview(URL.createObjectURL(file));
    } finally {
      setLogoUploading(false);
    }
  });

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
        tenant_name: tenantName,
        project_logo: logoId ?? "",
      }),
    });

    setPending(false);

    if (!response.ok) {
      setError(t("failed"));
      return;
    }

    // 🚨 /admin へ即座に飛ばさない。同じページの中身を完了の表示に差し替える。
    setStage("done");
  });

  if (stage === "done") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("done_title")}</h2>
          <p className="text-sm text-muted-foreground">{t("done_description")}</p>
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <Link
              href="/admin/settings/general"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("done_settings_link")}
            </Link>
          </li>
          <li className="text-muted-foreground">
            {t("done_tenant")} — {t("done_later")}
          </li>
          <li className="text-muted-foreground">
            {t("done_sso")} — {t("done_later")}
          </li>
          <li className="text-muted-foreground">
            {t("done_storage")} — {t("done_later")}
          </li>
        </ul>
        <Button
          type="button"
          className="min-h-(--control-h) w-full md:min-h-0"
          onClick={() => {
            router.push("/admin");
            router.refresh();
          }}
        >
          {t("go_admin")}
        </Button>
      </div>
    );
  }

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
        <hr className="border-0 border-t border-border" />
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-muted-foreground">{t("optional_heading")}</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="logo">{t("logo_label")}</Label>
            {/* 🚨 素の input type="file" でよい（design確認済み）。D&D/サムネの部品（要件A）が
                入ったら、ここだけ差し替えられる形にしてある。 */}
            <input
              id="logo"
              type="file"
              accept="image/*"
              onChange={uploadLogo.run}
              className="text-sm"
            />
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- アップロード直後のローカルプレビューのため
              <img src={logoPreview} alt="" className="h-12 w-12 rounded object-cover" />
            ) : null}
            {logoUploading ? (
              <p className="text-xs text-muted-foreground">{t("logo_uploading")}</p>
            ) : null}
            {logoError ? <p className="text-sm text-destructive">{logoError}</p> : null}
            <p className="text-xs text-muted-foreground">{t("logo_help")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tenant-name">{t("tenant_label")}</Label>
            <Input
              id="tenant-name"
              type="text"
              value={tenantName}
              onChange={(event) => setTenantName(event.target.value)}
              className="h-(--control-h) md:h-(--control-h-pc)"
            />
            <p className="text-xs text-muted-foreground">{t("tenant_help")}</p>
          </div>
        </div>
        <hr className="border-0 border-t border-border" />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="submit"
          className="min-h-(--control-h) w-full md:min-h-0"
          disabled={submit.pending || pending || logoUploading}
        >
          {pending ? t("submit_pending") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
