import Link from "next/link";
import { ErrorBanner } from "@/components/admin/error-banner";
import { FieldCreateForm } from "@/components/admin/field-create-form";
import { Surface } from "@/components/ui/surface";
import { errorKeyFromQuery } from "@/i18n/error";
import { getT } from "@/i18n/server";

type Props = {
  params: Promise<{ collection: string }>;
  // 🚨 **この画面は失敗の戻り先**（`app/admin/actions/collections/[collection]/fields/route.ts`）。
  //    戻り先をコレクション画面からここへ移したのは「入力を残すため」だが、
  //    **受け皿を置き忘れると `?error=` が黙って捨てられ、理由の無いまま同じフォームに戻る**
  //    （実測 2026-08-17: 同じ名前の欄を作ると `?error=conflict` は付くのに画面に何も出なかった）。
  searchParams: Promise<{ error?: string }>;
};

export default async function NewFieldPage({ params, searchParams }: Props) {
  const { collection } = await params;
  const query = await searchParams;
  const encoded = encodeURIComponent(collection);
  const tFields = await getT("fields");
  // 🚨 URL の値は鍵としてしか受け取らない（許可リスト・fail closed）。i18n/error.ts 参照。
  const tError = await getT("errors");
  const errorKey = errorKeyFromQuery(query.error);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/admin/collections/${encoded}`} className="text-sm text-muted-foreground hover:text-foreground">
          {tFields("back_to_collection")}
        </Link>
      </div>
      <ErrorBanner message={errorKey ? tError(errorKey) : null} />
      <Surface>
        <FieldCreateForm collection={encoded} />
      </Surface>
    </div>
  );
}
