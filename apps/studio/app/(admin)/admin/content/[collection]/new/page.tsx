import Link from "next/link";
import type { FieldResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { ItemForm } from "@/components/admin/item-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function NewItemPage({ params, searchParams }: Props) {
  const { collection } = await params;
  const query = await searchParams;
  const encoded = encodeURIComponent(collection);
  const fieldsResult = await apiFetch<FieldResult[]>(`/api/fields/${encoded}`);
  const fields = fieldsResult.ok ? fieldsResult.data : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/admin/content/${encoded}`} className="text-sm text-muted-foreground hover:underline">
          アイテム一覧へ
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">新規アイテム</h1>
      </div>
      <ErrorBanner message={query.error ?? (!fieldsResult.ok ? fieldsResult.message : null)} />
      <Card>
        <CardHeader>
          <CardTitle>{collection}</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemForm collection={collection} fields={fields} />
        </CardContent>
      </Card>
    </div>
  );
}
