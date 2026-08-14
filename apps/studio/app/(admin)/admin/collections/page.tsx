import Link from "next/link";
import type { CollectionResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { PageAction } from "@/components/admin/page-action";
import { Plus } from "lucide-react";
import { getT } from "@/i18n/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export default async function CollectionsPage() {
  const t = await getT("collections");
  const result = await apiFetch<CollectionResult[]>("/api/collections");

  return (
    <div className="max-w-6xl space-y-6">
      {/* 🚨 一覧のページは**まず一覧を見せる**（design ⑰）。作成フォームは
          /admin/collections/new へ移した。入口はこの主要アクション。

          🚨 **見出しと概要をここに置かない**（堀池・2026-08-15）:
          > 「…は必要ない。理由はタイトルはパンクズで表示するのと、
          >   その下の概要は『info』アイコンで説明する。」
          → 文言は消さず `lib/admin/page-meta.ts` の辞書キーとして残してある
            （右サイドバー・Storybook・LLM がそこから読む）。
          🚨 パンくずと右サイドバーは **ui ペインが作る**。**それが入るまで、
             この画面にはページ名がどこにも出ない**（意図した中間状態）。 */}
      <div className="flex justify-end">
        <PageAction
          href="/admin/collections/new"
          label={t("new_button")}
          icon={<Plus />}
        />
      </div>
      <ErrorBanner message={!result.ok ? result.message : null} />
      {/* 🚨 **枠で囲まない**（堀池・2026-08-15）:
          > 「ボーダー＋Padding はいらない。親要素にすでに Padding があるのと、
          >   カードコンポーネントを多用するのはデザインスキルが低い。
          >   **枠というのは明確な別の領域を表現する**が、…コレクション一覧しか
          >   セクションがないので、ボーダーも Padding も必要ない。
          >   **ただし、2つ要素が並ぶ場合は、その間に Divider を用意する**。」
          → このページの節は一覧ひとつだけなので、`Surface` で包まない。
          🚨 見出し（「一覧」）も出さない。「そもそも見てわかるので」。
             ただし**右サイドバーの項目一覧には出す**ので、辞書キーは
             `lib/admin/page-meta.ts` の `sectionKeys` に残してある。 */}
      <div>
        {result.ok ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("title")}</TableHead>
                <TableHead>{t("field_count_header")}</TableHead>
                <TableHead>{t("note_label")}</TableHead>
                <TableHead className="w-56">{t("actions_header")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((collection) => (
                <TableRow key={collection.collection}>
                  <TableCell className="font-medium">{collection.collection}</TableCell>
                  <TableCell>{collection.schema?.columns.length ?? 0}</TableCell>
                  <TableCell>{collection.meta?.note ?? ""}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/collections/${collection.collection}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        {t("fields_link")}
                      </Link>
                      <Link
                        href={`/admin/content/${collection.collection}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                      >
                        {t("items_link")}
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </div>
    </div>
  );
}
