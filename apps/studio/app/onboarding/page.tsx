import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/admin/onboarding-form";
import { getT } from "@/i18n/server";
import { SETUP_COOKIE, parseCookies } from "@/lib/auth/cookies";
import { isDefaultSetupPassword } from "@/lib/auth/setup";
import { isValidSetupSession } from "@/lib/auth/setup-session";
import { currentUser } from "@/lib/admin/api";
import { getSettings, isOnboardingCompleted } from "@/lib/settings/service";

export default async function OnboardingPage() {
  const headerStore = await headers();
  const setupToken = parseCookies(headerStore.get("cookie")).get(SETUP_COOKIE) ?? null;
  const setupAuthorized = isValidSetupSession(setupToken);
  const me = setupAuthorized ? null : await currentUser();
  if (!setupAuthorized && !me?.ok) {
    redirect("/login");
  }

  if ((await isOnboardingCompleted()) === true) {
    redirect("/admin");
  }

  const t = await getT("onboarding");
  const settings = await getSettings();
  const showDefaultPasswordWarning = isDefaultSetupPassword();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {showDefaultPasswordWarning ? (
          <p className="text-sm text-destructive">{t("default_password_warning")}</p>
        ) : null}
        <hr className="border-0 border-t border-border" />
        <OnboardingForm defaultProjectName={settings.project_name} />
      </div>
    </main>
  );
}
