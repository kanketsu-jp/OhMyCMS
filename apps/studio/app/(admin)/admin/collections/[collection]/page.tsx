import Link from "next/link";
import type { CollectionResult, FieldResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { getT } from "@/i18n/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default async function CollectionDetailPage({ params, searchParams }: Props) {
  const tCollections = await getT("collections");
  const tFields = await getT("fields");
  const tItems = await getT("items");
  const { collection } = await params;
  const query = await searchParams;
  const encoded = encodeURIComponent(collection);
  const [collectionResult, fieldsResult] = await Promise.all([
    apiFetch<CollectionResult>(`/api/collections/${encoded}`),
    apiFetch<FieldResult[]>(`/api/fields/${encoded}`),
  ]);

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
          (!fieldsResult.ok ? fieldsResult.message : null)
        }
      />
      {query.notice ? (
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">{query.notice}</div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{tFields("add_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={`/admin/actions/collections/${encoded}/fields`}
            method="post"
            className="grid gap-4 md:grid-cols-[1fr_180px_140px_120px_auto] md:items-end"
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
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                defaultValue="string"
              >
                {fieldTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_length">{tFields("max_length_label")}</Label>
              <Input id="max_length" name="max_length" type="number" min="1" />
            </div>
            <label className="flex h-8 items-center gap-2 text-sm">
              <input type="checkbox" name="required" value="true" className="size-4" />
              {tFields("required_label")}
            </label>
            <Button type="submit">{tFields("add_button")}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{tFields("list_title")}</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
