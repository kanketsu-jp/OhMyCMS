import Link from "next/link";
import type { FieldResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { ItemForm } from "@/components/admin/item-form";
import { errorKeyFromQuery } from "@/i18n/error";
import { getT } from "@/i18n/server";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ collection: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
};

function hasApiCode(result: { ok: boolean; code?: string }, code: string): boolean {
  return !result.ok && result.code === code;
}

function ItemNotFound({
  title,
  body,
  back,
}: {
  title: string;
  body: string;
  back: string;
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <Surface>
        <SurfaceTitle>{title}</SurfaceTitle>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-6">
          <Link href="/admin/content" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {back}
          </Link>
        </div>
      </Surface>
    </div>
  );
}

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
  if (
    hasApiCode(fieldsResult, "COLLECTION_NOT_FOUND") ||
    hasApiCode(itemResult, "COLLECTION_NOT_FOUND") ||
    hasApiCode(itemResult, "ITEM_NOT_FOUND")
  ) {
    return (
      <ItemNotFound
        title={
          hasApiCode(itemResult, "ITEM_NOT_FOUND")
            ? t("not_found_item_title")
            : t("not_found_collection_title")
        }
        body={t("not_found_body")}
        back={t("not_found_back")}
      />
    );
  }
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
          (!fieldsResult.ok ? tError(fieldsResult.messageKey) : null) ??
          (!itemResult.ok ? tError(itemResult.messageKey) : null)
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
