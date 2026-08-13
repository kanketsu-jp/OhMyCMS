import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { cn } from "@/lib/utils";

export default async function AdminPage() {
  const t = await getT("dashboard");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>
      <Surface>
        <SurfaceTitle>{t("schema_management_title")}</SurfaceTitle>
        <Link
          href="/admin/collections"
          className={cn(buttonVariants(), "w-fit")}
        >
          {t("open_collections_button")}
        </Link>
      </Surface>
    </div>
  );
}
