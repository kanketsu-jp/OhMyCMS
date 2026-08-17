import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { ErrorBanner } from "@/components/admin/error-banner";
import { ListEmpty } from "@/components/admin/list-empty";
import { buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/admin/api";
import { getT } from "@/i18n/server";

export default async function ContentIndexPage() {
  const t = await getT("nav");
  const tError = await getT("errors");
  const result = await apiFetch<{ collection: string }[]>("/api/collections?names=true");

  if (result.ok && result.data.length > 0) {
    redirect(`/admin/content/${encodeURIComponent(result.data[0].collection)}`);
  }

  return (
    <div className="max-w-3xl">
      <ErrorBanner message={!result.ok ? tError(result.messageKey) : null} />
      {result.ok ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("content_empty_title")}</h2>
            <ListEmpty>{t("content_empty_body")}</ListEmpty>
          </div>
          <div>
            <Link href="/admin/collections/new" className={buttonVariants()}>
              <Plus data-icon="inline-start" />
              {t("content_empty_action")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
