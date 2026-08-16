import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import type { CollectionResult, FieldResult, RelationResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { PageAction } from "@/components/admin/page-action";
import { sectionAnchorId } from "@/components/admin/page-sections";
import { RelationForm } from "@/components/admin/relation-form";
import { errorKeyFromQuery } from "@/i18n/error";
import { fieldLabel } from "@/lib/schema/labels";
import { getLocale, getT } from "@/i18n/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ error?: string }>;
};

type CollectionRelationRow = {
  key: string;
  kind: "m2o" | "o2m";
  relation: RelationResult;
  currentField: string;
  relatedCollection: string;
  relatedField: string;
};

function relationRows(relations: RelationResult[], collection: string): CollectionRelationRow[] {
  return relations.flatMap((relation) => {
    const rows: CollectionRelationRow[] = [];
    const meta = relation.meta;

    if (meta?.many_collection === collection) {
      rows.push({
        key: `${relation.many_collection}.${relation.many_field}.m2o`,
        kind: "m2o",
        relation,
        currentField: relation.many_field,
        relatedCollection: meta.one_collection ?? "",
        relatedField: "-",
      });
    }

    if (meta?.one_collection === collection && meta.one_field) {
      rows.push({
        key: `${relation.many_collection}.${relation.many_field}.o2m`,
        kind: "o2m",
        relation,
        currentField: meta.one_field,
        relatedCollection: relation.many_collection,
        relatedField: relation.many_field,
      });
    }

    return rows;
  });
}

export default async function CollectionDetailPage({ params, searchParams }: Props) {
  const query = await searchParams;
  // 🚨 URL の値は鍵としてしか受け取らない（許可リスト・fail closed）。i18n/error.ts 参照。
  const tError = await getT("errors");
  const errorKey = errorKeyFromQuery(query.error);
  const errorMessage = errorKey ? tError(errorKey) : null;
  const tCollections = await getT("collections");
  const tFields = await getT("fields");
  const tItems = await getT("items");
  const locale = await getLocale();
  const tRelations = await getT("relations");
  const { collection } = await params;
  const encoded = encodeURIComponent(collection);
  const [collectionResult, fieldsResult, relationsResult, collectionsResult] = await Promise.all([
    apiFetch<CollectionResult>(`/api/collections/${encoded}`),
    apiFetch<FieldResult[]>(`/api/fields/${encoded}`),
    apiFetch<RelationResult[]>("/api/relations"),
    apiFetch<CollectionResult[]>("/api/collections"),
  ]);
  // 🚨 **内部で使う項目は、既定で出さない**（設問286 A ②・design と合意した案 A）。
  //    利用者が作った項目ではなく、**消すと本体が壊れる**（本文の検索用の相方・論理削除の日時）。
  //    見せると「消してよいもの」に見える。
  // 🚨 **ただし無かったことにはしない**。件数を常に出して、開けば中身が見られる形にする
  //    （**見えないものは、在ることに気づけない**）。
  // 🚨 判定は **`meta.hidden` 1 本**。名前で除かない（`field === "deleted_at"` 等を書かない）——
  //    判定の道が 2 本あると、次に内部項目を足す人がどちらに従うか分からなくなる。
  const 見せる項目 = fieldsResult.ok ? fieldsResult.data.filter((f) => !f.meta?.hidden) : [];
  const 内部項目 = fieldsResult.ok ? fieldsResult.data.filter((f) => Boolean(f.meta?.hidden)) : [];
  const collectionRelations = relationsResult.ok
    ? relationRows(relationsResult.data, collection)
    : [];
  const collectionNames = collectionsResult.ok
    ? collectionsResult.data.map((item) => item.collection)
    : [];

  return (
    <div className="max-w-6xl space-y-6">
      {/* 🚨 **タイトル行（`flex flex-wrap items-start justify-between gap-3`）を外した**。
          原典（idea.md:65）:「この div は必要ない。理由はタイトルはパンくずで表示するのと、
          その下の概要は『info』アイコンで説明する」。
          いま**タイトルはヘッダーのパンくず**が、**概要は右パネル**が持っているので、
          この行が並べるものは何も残らない（`PageAction` は portal で外へ出る）。
          ❌ 戻さないこと。戻すと**同じ役目のものが2箇所**に出る。 */}
      <div>
        <Link href="/admin/collections" className="text-sm text-muted-foreground transition-colors hover:text-foreground active:text-foreground">
          {tCollections("back_to_list")}
        </Link>
      </div>
      {/* 🚨 **囲まない**（`PageAction` は portal で外へ出るので、ここに中身は残らない）。
          🚨 form は**残す**。`form="collection-delete-form"` が指す相手そのものなので、
             消すと削除ボタンが黙って効かなくなる（中身は空でよい）。 */}
      <form id="collection-delete-form" action={`/admin/actions/collections/${encoded}/delete`} method="post" />
      {/* 🚨 **主アクションは 1 つ。削除は ▾ の中**（堀池さん 283 A・2026-08-15 原文:
          「主アクションを別のものにし、削除はオプションへ」）。
          規約 `knowledge/decisions/action-button-and-edit-mode.md` §3。
          🚨 主を「フィールド追加」にしたのは**規約の表がそう決めている**から。
          **押された回数は測れない**（記録を取っていない）ので、**頻度の根拠は推測**。
          🚨 押したあとの振る舞い（ゴミ箱へ入るのか消えるのか）と文言は **288 待ち**。
          ここで決めたのは**置き場所だけ**。 */}
      <PageAction
        href={`/admin/collections/${encoded}/fields/new`}
        label={tFields("add_title")}
        icon={<Plus />}
        options={[
          {
            label: tCollections("delete_button"),
            formId: "collection-delete-form",
            destructive: true,
          },
        ]}
      />
      <ErrorBanner
        message={
          errorMessage ??
          (!collectionResult.ok ? tError(collectionResult.messageKey) : null) ??
          (!fieldsResult.ok ? tError(fieldsResult.messageKey) : null) ??
          (!relationsResult.ok ? tError(relationsResult.messageKey) : null)
        }
      />
      <Surface id={sectionAnchorId("fields.list_title")}>
        {/* 🚨 見出しは出さない（堀池・2026-08-15「「〜一覧」の見出しは全部消す」）。
            見て分かるものに名前を付けない。**右サイドバーの「項目一覧」には出る**ので、
            辞書の鍵は消さないこと（消すと項目一覧の名前が消える）。 */}
        {fieldsResult.ok ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tFields("field_header")}</TableHead>
                <TableHead>{tFields("type_label")}</TableHead>
                <TableHead>{tFields("required_label")}</TableHead>
                <TableHead>{tFields("primary_key_header")}</TableHead>
                <TableHead>{tFields("db_type_header")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {見せる項目.map((field) => (
                <TableRow key={field.field}>
                  <TableCell className="font-medium">
                    {/* 🚨 生の識別子でなく辞書を通す（設問286 A ②）。
                        辞書が空なら `fieldLabel` が識別子を返すので、
                        名前を付けるまでは**いままでと 1 文字も変わらない**。 */}
                    {fieldLabel(field, locale)}
                  </TableCell>
                  <TableCell>{field.type}</TableCell>
                  <TableCell>{field.schema?.is_nullable === false ? tFields("yes") : tFields("no")}</TableCell>
                  <TableCell>{field.schema?.is_primary_key ? tFields("yes") : tFields("no")}</TableCell>
                  <TableCell>{field.schema?.data_type ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {/* 🚨 面は増やさない（`no-nested-surfaces`）。表と同じ面の中に置く。 */}
        {内部項目.length > 0 ? (
          <Accordion className="mt-4">
            <AccordionItem value="internal-fields">
              <AccordionTrigger>
                {tFields("internal_fields_title", { count: 内部項目.length })}
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">{tFields("internal_fields_note")}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tFields("field_header")}</TableHead>
                      <TableHead>{tFields("type_label")}</TableHead>
                      <TableHead>{tFields("db_type_header")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {内部項目.map((field) => (
                      <TableRow key={field.field}>
                        <TableCell className="font-medium">{fieldLabel(field, locale)}</TableCell>
                        <TableCell>{field.type}</TableCell>
                        <TableCell>{field.schema?.data_type ?? ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
        <div className="mt-4">
          <Link
            href={`/admin/content/${encoded}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {tItems("manage_link")}
          </Link>
        </div>
      </Surface>
      <Surface id={sectionAnchorId("relations.list_title")}>
        {relationsResult.ok ? (
          collectionRelations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tRelations("kind_header")}</TableHead>
                  <TableHead>{tRelations("current_field_header")}</TableHead>
                  <TableHead>{tRelations("related_collection_header")}</TableHead>
                  <TableHead>{tRelations("related_field_header")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {collectionRelations.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{tRelations(row.kind === "m2o" ? "kind_m2o" : "kind_o2m")}</TableCell>
                    <TableCell className="font-medium">{row.currentField}</TableCell>
                    <TableCell>{row.relatedCollection}</TableCell>
                    <TableCell>{row.relatedField}</TableCell>
                    <TableCell className="text-right">
                      <form
                        action={`/admin/actions/collections/${encoded}/relations/delete`}
                        method="post"
                      >
                        <input type="hidden" name="many_collection" value={row.relation.many_collection} />
                        <input type="hidden" name="many_field" value={row.relation.many_field} />
                        <Button type="submit" variant="destructive-ghost" size="sm" aria-label={tRelations("delete_button")}>
                          <Trash2 />
                          <span className="hidden md:inline">{tRelations("delete_button")}</span>
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{tRelations("empty_relations")}</p>
          )
        ) : null}
      </Surface>
      <Surface id={sectionAnchorId("relations.add_title")}>
        <SurfaceTitle>{tRelations("add_title")}</SurfaceTitle>
        <RelationForm collection={collection} collectionNames={collectionNames} />
      </Surface>
    </div>
  );
}
