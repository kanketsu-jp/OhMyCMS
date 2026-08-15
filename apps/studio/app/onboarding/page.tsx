import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LocaleSwitcher } from "@/components/admin/locale-switcher";
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
  const showDefaultPasswordWarning = await isDefaultSetupPassword();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <LocaleSwitcher className="fixed right-4 top-4" />
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <hr className="border-0 border-t border-border" />
        {/* 🚨 「既定のパスワードのまま」の表示は、**フォーム側が持つ**。
            ここ（Server Component）で描くと、完了へ切り替わったあとも消えない。
            切り替えはクライアントが持っているので、サーバは再実行されない。
            → **状態を変える場所と、それを表示する場所を一致させる**（design 指摘・2026-08-13）。 */}
        <OnboardingForm
          defaultProjectName={settings.project_name}
          usingDefaultPassword={showDefaultPasswordWarning}
        />
      </div>
    </main>
  );
}
