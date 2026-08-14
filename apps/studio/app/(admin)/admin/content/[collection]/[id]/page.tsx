import Link from "next/link";
import type { FieldResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { ItemForm } from "@/components/admin/item-form";
import { errorKeyFromQuery } from "@/i18n/error";
import { getT } from "@/i18n/server";
import { Surface, SurfaceTitle } from "@/components/ui/surface";

type Props = {
  params: Promise<{ collection: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function EditItemPage({ params, searchParams }: Props) {
  const query = await searchParams;
  // 🚨 URL の値は鍵としてしか受け取らない（許可リスト・fail closed）。i18n/error.ts 参照。
  const tError = await getT("errors");
  const errorKey = errorKeyFromQuery(query.error);
  const errorMessage = errorKey ? tError(errorKey) : null;
  const t = await getT("items");
  const { collection, id } = await params;
  const encoded = encodeURIComponent(collection);
  const encodedId = encodeURIComponent(id);
  const [fieldsResult, itemResult] = await Promise.all([
    apiFetch<FieldResult[]>(`/api/fields/${encoded}`),
    apiFetch<{ data: Record<string, unknown> }>(`/api/items/${encoded}/${encodedId}`),
  ]);
  const fields = fieldsResult.ok ? fieldsResult.data : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/admin/content/${encoded}`} className="text-sm text-muted-foreground hover:text-foreground">
          {t("back_to_list")}
        </Link>
      </div>
      <ErrorBanner
        message={
          errorMessage ??
          (!fieldsResult.ok ? fieldsResult.message : null) ??
          (!itemResult.ok ? itemResult.message : null)
        }
      />
      {itemResult.ok ? (
        <Surface>
          <SurfaceTitle>{collection}</SurfaceTitle>
          <ItemForm
            collection={collection}
            fields={fields}
            itemId={id}
            item={itemResult.data.data}
          />
        </Surface>
      ) : null}
    </div>
  );
}
