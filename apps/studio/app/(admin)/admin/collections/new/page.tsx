import Link from "next/link";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageAction } from "@/components/admin/page-action";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/admin/error-banner";
import { Label } from "@/components/ui/label";
import { Surface } from "@/components/ui/surface";
import { errorKeyFromQuery } from "@/i18n/error";
import { getT } from "@/i18n/server";
import { cn } from "@/lib/utils";

/**
 * コレクションを作る画面。
 *
 * 🚨 **一覧の上に置かない**（オーナー指示・design ⑰）:
 * 「『コレクション』を押下する人は『コレクション』が見たいので、**新規作成が上に来ることはない。
 *   新規作成は下層ページにする。**`admin/collections/new` など。**これは全てのページにする。**」
 *
 * 🚨 その場で開く形（畳んで展開）にはしない。**開くとその場に割り込んで、
 * そのページの主役が入れ替わる**のが弱点だった。別ページなら一覧は最後まで一覧のまま。
 */
type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewCollectionPage({ searchParams }: Props) {
  const params = await searchParams;
  // 🚨 URL の値は鍵としてしか受け取らない（許可リスト・fail closed）。i18n/error.ts 参照。
  const tError = await getT("errors");
  const errorKey = errorKeyFromQuery(params.error);
  const errorMessage = errorKey ? tError(errorKey) : null;
  const t = await getT("collections");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href="/admin/collections"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("back_to_list")}
        </Link>
      </div>
      <ErrorBanner message={errorMessage} />
      <Surface>
        <form id="collection-create-form" action="/admin/actions/collections" method="post" className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="collection">{t("name_label")}</Label>
            <Input id="collection" name="collection" required pattern="[A-Za-z_][A-Za-z0-9_]*" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">{t("note_label")}</Label>
            <Input id="note" name="note" />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/collections"
              className={cn(buttonVariants({ variant: "ghost" }))}
            >
              {t("cancel_button")}
            </Link>
          </div>
          <PageAction
            form="collection-create-form"
            role="primary"
            label={t("create_button")}
            icon={<Check />}
          />
        </form>
      </Surface>
    </div>
  );
}
