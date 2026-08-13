import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { FieldResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { FieldDisplay, type DisplayLookup } from "@/components/admin/field-display";
import { isFileField } from "@/lib/schema/interfaces";
import { ErrorBanner } from "@/components/admin/error-banner";
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

type ItemsPayload = {
  data: Record<string, unknown>[];
  meta?: { filter_count?: number };
};

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ page?: string; error?: string; notice?: string }>;
};

/**
 * 🚨 かつてここに `renderValue()` があり、**オブジェクトなら JSON.stringify** していた。
 * 型を問わず中括弧ごと画面に出るのはそのせい（堀池さん「json がそのまま書かれている」）。
 * Directus の 18 種の display を読むと、その実装はそこにある **`raw`** と同じで、
 * 向こうは**利用者が明示的に選んだときだけ**使う。既定にしていたのが誤りだった。
 * → 判断は lib/schema/displays.ts、描画は components/admin/field-display.tsx へ移した。
 */

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

  // 🚨 ファイル列に **UUID を出さない**ので、名前とサムネの元をここで**まとめて1回**引く。
  // 行ごとに引くと N+1 になる（knowledge/decisions/relation-permission-boundary.md）。
  // 引けなければ何も出さない（id を出すくらいなら空のほうがよい）。
  const lookup: DisplayLookup = {};
  const fileColumns = columns.filter((field) => isFileField(field));
  if (fileColumns.length > 0 && itemsResult.ok) {
    const ids = new Set<string>();
    for (const item of itemsResult.data.data) {
      for (const field of fileColumns) {
        const value = item[field.field];
        if (typeof value === "string" && value !== "") ids.add(value);
      }
    }
    if (ids.size > 0) {
      // 権限は API 側で効く。見えない相手は返ってこない＝画面にも出ない
      const files = await apiFetch<{ data: { id: string; filename_download: string; type: string | null }[] }>(
        `/api/files?limit=${ids.size}`,
      );
      if (files.ok) {
        lookup.files = new Map(
          files.data.data
            .filter((row) => ids.has(row.id))
            .map((row) => [
              row.id,
              { filename: row.filename_download, isImage: Boolean(row.type?.startsWith("image/")) },
            ]),
        );
      }
    }
  }

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
        <div className="text-sm text-muted-foreground">{query.notice}</div>
      ) : null}
      <Surface>
        <SurfaceTitle>{t("list_title")}</SurfaceTitle>
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
                          <FieldDisplay field={field} value={item[field.field]} lookup={lookup} />
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
                            <Button type="submit" variant="destructive-ghost" size="sm" aria-label={t("delete_button")}>
                              <Trash2 />
                              <span className="hidden md:inline">{t("delete_button")}</span>
                            </Button>
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
      </Surface>
    </div>
  );
}
