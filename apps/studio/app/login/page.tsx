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
import { projectLogo } from "@/lib/settings/project-logo";
import { projectName } from "@/lib/settings/project-name";

export default async function LoginPage() {
  const t = await getT("auth");
  const tCommon = await getT("common");
  const settings = await getSettings();
  const brand = await projectName(tCommon("app_name"));
  const logo = await projectLogo();
  const otpEnabled = (await mailConfig()) !== null;
  const googleEnabled = Boolean(settings.google_client_id) && settings.google_client_secret_set;
  const showDefaultPasswordWarning = await isDefaultSetupPassword();

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <LocaleSwitcher className="fixed right-4 top-4" />
      <div className="flex w-full max-w-sm flex-col gap-6">
        {/* 🚨 ここは **見出しのまま**にする（リンクにしない）。
            管理画面の2箇所は「押すとトップへ戻る」ための Link だが、
            ログイン画面はまだ入っていないので、/admin へ送っても弾かれて戻ってくるだけ。
            h1 を外すと、この画面から**見出しが1つも無くなる**。 */}
        <h1 className="flex items-center justify-center gap-2 text-center text-xl font-semibold">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- 外部URLもありうるので Image コンポーネントを使わない
            <img src={logo} alt="" className="h-6 w-auto max-w-32 object-contain" />
          ) : null}
          <span className="truncate">{brand}</span>
        </h1>
        {settings.public_note ? (
          <p className="text-center text-sm text-muted-foreground">{settings.public_note}</p>
        ) : null}
        {showDefaultPasswordWarning ? (
          <p className="text-center text-sm text-destructive">
            {t("default_password_notice")}
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
