import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
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
      <Card>
        <CardHeader>
          <CardTitle>{t("schema_management_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/admin/collections"
            className={cn(buttonVariants(), "w-fit")}
          >
            {t("open_collections_button")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
