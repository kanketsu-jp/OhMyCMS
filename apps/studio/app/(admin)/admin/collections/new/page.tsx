import Link from "next/link";
import { ErrorBanner } from "@/components/admin/error-banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

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
export default async function NewCollectionPage({ searchParams }: Props) {
  const t = await getT("collections");
  const params = await searchParams;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href="/admin/collections"
          className="text-sm text-muted-foreground hover:underline"
        >
          {t("back_to_list")}
        </Link>
      </div>
      <ErrorBanner message={params.error ?? null} />
      <Surface>
        <form action="/admin/actions/collections" method="post" className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="collection">{t("name_label")}</Label>
            <Input id="collection" name="collection" required pattern="[A-Za-z_][A-Za-z0-9_]*" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">{t("note_label")}</Label>
            <Input id="note" name="note" />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit">{t("create_button")}</Button>
            <Link
              href="/admin/collections"
              className={cn(buttonVariants({ variant: "ghost" }))}
            >
              {t("cancel_button")}
            </Link>
          </div>
        </form>
      </Surface>
    </div>
  );
}
