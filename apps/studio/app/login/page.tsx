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
              className={cn(buttonVariants({ variant: "outline", size: "entry" }))}
            >
              {/* 🚨 外部URLから読まない（オフライン・CSPで壊れる）。インラインSVG。 */}
              <svg viewBox="0 0 18 18" aria-hidden="true" className="size-5">
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                />
              </svg>
              {t("google_login")}
            </Link>
          </>
        ) : null}
      </div>
    </main>
  );
}
