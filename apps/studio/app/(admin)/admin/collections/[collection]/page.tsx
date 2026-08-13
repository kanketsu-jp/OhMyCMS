import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { CollectionResult, FieldResult, RelationResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { FIELD_INTERFACE_IDS } from "@/lib/schema/interfaces";
import { ErrorBanner } from "@/components/admin/error-banner";
import { RelationForm } from "@/components/admin/relation-form";
import { getT } from "@/i18n/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const fieldTypes = [
  "string",
  "integer",
  "boolean",
  "uuid",
  "dateTime",
  "json",
  "float",
  "decimal",
  "bigInteger",
  "date",
  "time",
];

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
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
  const tCollections = await getT("collections");
  const tFields = await getT("fields");
  const tItems = await getT("items");
  const tRelations = await getT("relations");
  const { collection } = await params;
  const query = await searchParams;
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/collections" className="text-sm text-muted-foreground hover:underline">
            {tCollections("back_to_list")}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{collection}</h1>
        </div>
        <form action={`/admin/actions/collections/${encoded}/delete`} method="post">
          <Button type="submit" variant="destructive">{tCollections("delete_button")}</Button>
        </form>
      </div>
      <ErrorBanner
        message={
          query.error ??
          (!collectionResult.ok ? collectionResult.message : null) ??
          (!fieldsResult.ok ? fieldsResult.message : null) ??
          (!relationsResult.ok ? relationsResult.message : null)
        }
      />
      {query.notice ? (
        <div className="text-sm text-muted-foreground">{query.notice}</div>
      ) : null}
      <Surface>
        <SurfaceTitle>{tFields("add_title")}</SurfaceTitle>
        <form
          action={`/admin/actions/collections/${encoded}/fields`}
          method="post"
          className="grid gap-4 md:grid-cols-[1fr_150px_170px_120px_110px_auto] md:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor="field">{tFields("name_label")}</Label>
            <Input id="field" name="field" required pattern="[A-Za-z_][A-Za-z0-9_]*" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">{tFields("type_label")}</Label>
            <select
              id="type"
              name="type"
              className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc) md:text-sm"
              defaultValue="string"
            >
              {fieldTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          {/*
            🚨 「型」は DB の列の型、「編集のしかた」は**その列を何で編集させるか**。
            本文（リッチテキスト）は json 型 + interface=richtext で表す（新しい SQL 型を足さない）。
            型に合わない組み合わせはサーバ側で落として既定へ戻す。
          */}
          <div className="space-y-1.5">
            <Label htmlFor="interface">{tFields("interface_label")}</Label>
            <select
              id="interface"
              name="interface"
              className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc) md:text-sm"
              defaultValue=""
            >
              <option value="">{tFields("interface_auto")}</option>
              {FIELD_INTERFACE_IDS.map((id) => (
                <option key={id} value={id}>{tFields(`interface_${id}`)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max_length">{tFields("max_length_label")}</Label>
            <Input id="max_length" name="max_length" type="number" min="1" />
          </div>
          <label className="flex h-(--control-h) items-center gap-2 text-sm md:h-(--control-h-pc)">
            <input type="checkbox" name="required" value="true" className="size-4" />
            {tFields("required_label")}
          </label>
          <Button type="submit">{tFields("add_button")}</Button>
        </form>
      </Surface>
      <Surface>
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
      <Surface>
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
      <Surface>
        <SurfaceTitle>{tRelations("add_title")}</SurfaceTitle>
        <RelationForm collection={collection} collectionNames={collectionNames} />
      </Surface>
    </div>
  );
}
