import Link from "next/link";
import type { FieldResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { ItemForm } from "@/components/admin/item-form";
import { getT } from "@/i18n/server";
import { Surface, SurfaceTitle } from "@/components/ui/surface";

type Props = {
  params: Promise<{ collection: string }>;
};

export default async function NewItemPage({ params }: Props) {
  const t = await getT("items");
  const { collection } = await params;
  const encoded = encodeURIComponent(collection);
  const fieldsResult = await apiFetch<FieldResult[]>(`/api/fields/${encoded}`);
  const fields = fieldsResult.ok ? fieldsResult.data : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/admin/content/${encoded}`} className="text-sm text-muted-foreground hover:underline">
          {t("back_to_list")}
        </Link>
      </div>
      <ErrorBanner message={!fieldsResult.ok ? fieldsResult.message : null} />
      <Surface>
        <SurfaceTitle>{collection}</SurfaceTitle>
        <ItemForm collection={collection} fields={fields} />
      </Surface>
    </div>
  );
}
