import type { FieldResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { ParentBackLink } from "@/components/admin/parent-back-link";
import { ItemForm } from "@/components/admin/item-form";
import { errorKeyFromQuery } from "@/i18n/error";
import { getT } from "@/i18n/server";
import { Surface, SurfaceTitle } from "@/components/ui/surface";

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function NewItemPage({ params, searchParams }: Props) {
  const query = await searchParams;
  // 🚨 URL の値は鍵としてしか受け取らない（許可リスト・fail closed）。i18n/error.ts 参照。
  const tError = await getT("errors");
  const errorKey = errorKeyFromQuery(query.error);
  const errorMessage = errorKey ? tError(errorKey) : null;
  const t = await getT("items");
  const { collection } = await params;
  const encoded = encodeURIComponent(collection);
  const fieldsResult = await apiFetch<FieldResult[]>(`/api/fields/${encoded}`);
  const fields = fieldsResult.ok ? fieldsResult.data : [];

  return (
    <div className="max-w-3xl space-y-6">
      <ParentBackLink href={`/admin/content/${encoded}`}>{t("back_to_list")}</ParentBackLink>
      <ErrorBanner message={errorMessage ?? (!fieldsResult.ok ? tError(fieldsResult.messageKey) : null)} />
      <Surface>
        <SurfaceTitle>{collection}</SurfaceTitle>
        <ItemForm collection={collection} fields={fields} />
      </Surface>
    </div>
  );
}
