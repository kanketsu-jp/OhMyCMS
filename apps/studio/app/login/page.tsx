import Link from "next/link";
import { DevLoginForm } from "@/components/admin/dev-login-form";
import { LocaleSwitcher } from "@/components/admin/locale-switcher";
import { Surface, SurfaceDescription, SurfaceTitle } from "@/components/ui/surface";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { projectName } from "@/lib/settings/project-name";

export default async function LoginPage() {
  const t = await getT("auth");
  const tCommon = await getT("common");
  const brand = await projectName(tCommon("app_name"));

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <LocaleSwitcher className="fixed right-4 top-4" />
      <Surface className="mx-auto w-full max-w-sm">
        <SurfaceTitle>{brand}</SurfaceTitle>
        <SurfaceDescription>{t("subtitle")}</SurfaceDescription>
        <Link
          href="/api/auth/google"
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          {t("google_login")}
        </Link>
        <div className="space-y-2 border-t pt-5">
          <p className="text-sm font-medium">{t("dev_login")}</p>
          <DevLoginForm />
        </div>
      </Surface>
    </main>
  );
}
