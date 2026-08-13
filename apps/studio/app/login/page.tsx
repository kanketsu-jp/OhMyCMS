import Link from "next/link";
import { LocaleSwitcher } from "@/components/admin/locale-switcher";
import { OtpLoginForm } from "@/components/admin/otp-login-form";
import { SetupForm } from "@/components/admin/setup-form";
import { buttonVariants } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { isDefaultSetupPassword } from "@/lib/auth/setup";
import { mailConfig } from "@/lib/reports/service";
import { getSettings } from "@/lib/settings/service";
import { projectName } from "@/lib/settings/project-name";

export default async function LoginPage() {
  const t = await getT("auth");
  const tCommon = await getT("common");
  // 🚨 default_password_warning は onboarding 名前空間のキーを流用する（ログイン画面専用の
  //    別キーを新設せず、オンボーディング画面と文言を一本化するため）。
  const tOnboarding = await getT("onboarding");
  const settings = await getSettings();
  const brand = await projectName(tCommon("app_name"));
  const otpEnabled = mailConfig() !== null;
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const showDefaultPasswordWarning = await isDefaultSetupPassword();

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <LocaleSwitcher className="fixed right-4 top-4" />
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-center text-xl font-semibold">{brand}</h1>
        {settings.public_note ? (
          <p className="text-center text-sm text-muted-foreground">{settings.public_note}</p>
        ) : null}
        {showDefaultPasswordWarning ? (
          <p className="text-center text-sm text-destructive">
            {tOnboarding("default_password_warning")}
          </p>
        ) : null}
        <SetupForm />
        {otpEnabled ? (
          <>
            <hr className="border-0 border-t border-border" />
            <OtpLoginForm />
          </>
        ) : null}
        {googleEnabled ? (
          <>
            <hr className="border-0 border-t border-border" />
            <Link
              href="/api/auth/google"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "min-h-(--control-h) w-full md:min-h-0",
              )}
            >
              {t("google_login")}
            </Link>
          </>
        ) : null}
      </div>
    </main>
  );
}
