import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import type { CollectionResult, FieldResult, RelationResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { PageAction } from "@/components/admin/page-action";
import { sectionAnchorId } from "@/components/admin/page-sections";
import { RelationForm } from "@/components/admin/relation-form";
import { errorKeyFromQuery } from "@/i18n/error";
import { getT } from "@/i18n/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
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
  const tRelations = await getT("relations");
  const { collection } = await params;
  const encoded = encodeURIComponent(collection);
  const [collectionResult, fieldsResult, relationsResult, collectionsResult] = await Promise.all([
    apiFetch<CollectionResult>(`/api/collections/${encoded}`),
    apiFetch<FieldResult[]>(`/api/fields/${encoded}`),
    apiFetch<RelationResult[]>("/api/relations"),
    apiFetch<CollectionResult[]>("/api/collections"),
  ]);
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
        <Link href="/admin/collections" className="text-sm text-muted-foreground hover:text-foreground">
          {tCollections("back_to_list")}
        </Link>
      </div>
      {/* 🚨 **囲まない**（`PageAction` は portal で外へ出るので、ここに中身は残らない）。
          🚨 form は**残す**。`form="collection-delete-form"` が指す相手そのものなので、
             消すと削除ボタンが黙って効かなくなる（中身は空でよい）。 */}
      <PageAction
        href={`/admin/collections/${encoded}/fields/new`}
        label={tFields("add_title")}
        icon={<Plus />}
      />
      <form id="collection-delete-form" action={`/admin/actions/collections/${encoded}/delete`} method="post" />
      <PageAction
        form="collection-delete-form"
        role="secondary"
        destructive
        label={tCollections("delete_button")}
        icon={<Trash2 />}
      />
      <ErrorBanner
        message={
          errorMessage ??
          (!collectionResult.ok ? collectionResult.message : null) ??
          (!fieldsResult.ok ? fieldsResult.message : null) ??
          (!relationsResult.ok ? relationsResult.message : null)
        }
      />
      <Surface id={sectionAnchorId("fields.list_title")}>
        <SurfaceTitle>{tFields("list_title")}</SurfaceTitle>
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
              {fieldsResult.data.map((field) => (
                <TableRow key={field.field}>
                  <TableCell className="font-medium">{field.field}</TableCell>
                  <TableCell>{field.type}</TableCell>
                  <TableCell>{field.schema?.is_nullable === false ? tFields("yes") : tFields("no")}</TableCell>
                  <TableCell>{field.schema?.is_primary_key ? tFields("yes") : tFields("no")}</TableCell>
                  <TableCell>{field.schema?.data_type ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
        <SurfaceTitle>{tRelations("list_title")}</SurfaceTitle>
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
