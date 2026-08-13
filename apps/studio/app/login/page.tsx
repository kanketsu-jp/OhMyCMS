import Link from "next/link";
import { LocaleSwitcher } from "@/components/admin/locale-switcher";
import { PasswordLoginForm } from "@/components/admin/password-login-form";
import { SetupForm } from "@/components/admin/setup-form";
import { buttonVariants } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { getSettings, isOnboardingCompleted } from "@/lib/settings/service";
import { projectName } from "@/lib/settings/project-name";

export default async function LoginPage() {
  const t = await getT("auth");
  const tCommon = await getT("common");
  const settings = await getSettings();
  const brand = await projectName(tCommon("app_name"));
  const completed = await isOnboardingCompleted();
  const googleEnabled = completed && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <LocaleSwitcher className="fixed right-4 top-4" />
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-center text-xl font-semibold">{brand}</h1>
        {completed && settings.public_note ? (
          <p className="text-center text-sm text-muted-foreground">{settings.public_note}</p>
        ) : null}
        {completed ? <PasswordLoginForm /> : <SetupForm />}
        {googleEnabled ? (
          <>
            <hr className="border-0 border-t border-border" />
            <Link
              href="/api/auth/google"
              className={cn(buttonVariants({ variant: "outline" }), "min-h-(--control-h) w-full md:min-h-0")}
            >
              {t("google_login")}
            </Link>
          </>
        ) : null}
      </div>
    </main>
  );
}
