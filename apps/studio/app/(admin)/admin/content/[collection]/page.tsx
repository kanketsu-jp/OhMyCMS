import Link from "next/link";
import type { FieldResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { getT } from "@/i18n/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ItemsPayload = {
  data: Record<string, unknown>[];
  meta?: { filter_count?: number };
};

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ page?: string; error?: string; notice?: string }>;
};

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function primaryKey(fields: FieldResult[]): string {
  return fields.find((field) => field.schema?.is_primary_key)?.field ?? "id";
}

export default async function ContentPage({ params, searchParams }: Props) {
  const t = await getT("items");
  const tFields = await getT("fields");
  const { collection } = await params;
  const query = await searchParams;
  const page = Math.max(1, Number(query.page ?? "1") || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const encoded = encodeURIComponent(collection);
  const [fieldsResult, itemsResult] = await Promise.all([
    apiFetch<FieldResult[]>(`/api/fields/${encoded}`),
    apiFetch<ItemsPayload>(`/api/items/${encoded}?limit=${limit}&offset=${offset}&meta=filter_count`),
  ]);

  const fields = fieldsResult.ok
    ? fieldsResult.data.filter((field) => Boolean(field.schema))
    : [];
  const columns = fields.slice(0, 8);
  const pk = primaryKey(fields);
  const total = itemsResult.ok ? itemsResult.data.meta?.filter_count ?? itemsResult.data.data.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/admin/collections/${encoded}`} className="text-sm text-muted-foreground hover:underline">
            {tFields("manage_link")}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{t("title_for_collection", { collection })}</h1>
        </div>
        <Link href={`/admin/content/${encoded}/new`} className={cn(buttonVariants())}>
          {t("new_item")}
        </Link>
      </div>
      <ErrorBanner
        message={
          query.error ??
          (!fieldsResult.ok ? fieldsResult.message : null) ??
          (!itemsResult.ok ? itemsResult.message : null)
        }
      />
      {query.notice ? (
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">{query.notice}</div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("list_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {itemsResult.ok ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((field) => (
                      <TableHead key={field.field}>{field.field}</TableHead>
                    ))}
                    <TableHead className="w-44">{t("actions_header")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsResult.data.data.map((item, index) => {
                    const id = String(item[pk] ?? "");
                    return (
                      <TableRow key={id || index}>
                        {columns.map((field) => (
                          <TableCell key={field.field} className="max-w-64 truncate">
                            {renderValue(item[field.field])}
                          </TableCell>
                        ))}
                        <TableCell>
                          <div className="flex gap-2">
                            <Link
                              href={`/admin/content/${encoded}/${encodeURIComponent(id)}`}
                              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                            >
                              {t("edit_button")}
                            </Link>
                            <form action={`/admin/actions/items/${encoded}/${encodeURIComponent(id)}`} method="post">
                              <input type="hidden" name="_method" value="delete" />
                              <Button type="submit" variant="destructive" size="sm">{t("delete_button")}</Button>
                            </form>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span>{t("pagination_summary", { total, from: offset + 1, to: Math.min(offset + limit, total) })}</span>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/content/${encoded}?page=${Math.max(1, page - 1)}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
                  >
                    {t("prev_page")}
                  </Link>
                  <Link
                    href={`/admin/content/${encoded}?page=${Math.min(pageCount, page + 1)}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= pageCount && "pointer-events-none opacity-50")}
                  >
                    {t("next_page")}
                  </Link>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
