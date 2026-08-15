import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import type { FieldResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { FieldDisplay, type DisplayLookup } from "@/components/admin/field-display";
import { isFileField } from "@/lib/schema/interfaces";
import { ErrorBanner } from "@/components/admin/error-banner";
import { PageAction } from "@/components/admin/page-action";
import { sectionAnchorId } from "@/components/admin/page-sections";
import { errorKeyFromQuery } from "@/i18n/error";
import { getT } from "@/i18n/server";
import { DEFAULT_COLUMN_COUNT, DEFAULT_LIST_LIMIT, resolveColumns, resolveLimit } from "@/lib/admin/list-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
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
  searchParams: Promise<{ page?: string; error?: string; notice?: string; cols?: string; limit?: string }>;
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

function pageHref(
  encoded: string,
  page: number,
  columns: FieldResult[],
  limit: number,
  fields: FieldResult[],
): string {
  const query = new URLSearchParams({ page: String(page) });
  const defaultColumns = fields.slice(0, DEFAULT_COLUMN_COUNT).map((field) => field.field);
  const selectedColumns = columns.map((field) => field.field);
  if (
    selectedColumns.length !== defaultColumns.length ||
    selectedColumns.some((field, index) => field !== defaultColumns[index])
  ) {
    query.set("cols", selectedColumns.join(","));
  }
  if (limit !== DEFAULT_LIST_LIMIT) query.set("limit", String(limit));
  return `/admin/content/${encoded}?${query.toString()}`;
}

export default async function ContentPage({ params, searchParams }: Props) {
  const t = await getT("items");
  const tFields = await getT("fields");
  const { collection } = await params;
  const query = await searchParams;
  // 🚨 URL の値は鍵としてしか受け取らない（許可リスト・fail closed）。i18n/error.ts 参照。
  const tError = await getT("errors");
  const errorKey = errorKeyFromQuery(query.error);
  const errorMessage = errorKey ? tError(errorKey) : null;
  const page = Math.max(1, Number(query.page ?? "1") || 1);
  const limit = resolveLimit(query.limit);
  const offset = (page - 1) * limit;
  const encoded = encodeURIComponent(collection);
  const [fieldsResult, itemsResult] = await Promise.all([
    apiFetch<FieldResult[]>(`/api/fields/${encoded}`),
    apiFetch<ItemsPayload>(`/api/items/${encoded}?limit=${limit}&offset=${offset}&meta=filter_count`),
  ]);

  const fields = fieldsResult.ok
    // 🚨 hidden の列を一覧に出さない。本文の検索用の相方（`<field>_plain`）が
    //    表の列として出ていた（2026-08-15 実測: 列見出しが body / **body_plain** / id / 操作）。
    //    中身は本文から導出される内部用の列なので、書き手にも読み手にも見せない。
    //    `item-form.tsx` は同じ規則を持っていたが、一覧側だけ抜けていた。
    ? fieldsResult.data.filter((field) => Boolean(field.schema) && !field.meta?.hidden)
    : [];
  const columns = resolveColumns(query.cols, fields);
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
    <>
      <PageAction
        href={`/admin/content/${encoded}/new`}
        role="primary"
        label={t("new_item")}
        icon={<Plus />}
      />
      <div className="max-w-7xl space-y-6">
        <div>
          <Link href={`/admin/collections/${encoded}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground active:text-foreground">
            {tFields("manage_link")}
          </Link>
        </div>
        <ErrorBanner
          message={
            errorMessage ??
            (!fieldsResult.ok ? fieldsResult.message : null) ??
            (!itemsResult.ok ? itemsResult.message : null)
          }
        />
        <Surface id={sectionAnchorId("items.list_title")}>
        {/* 🚨 見出しは出さない（堀池・2026-08-15「「〜一覧」の見出しは全部消す」）。
            見て分かるものに名前を付けない。**右サイドバーの「項目一覧」には出る**ので、
            辞書の鍵は消さないこと（消すと項目一覧の名前が消える）。 */}
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
                    href={pageHref(encoded, Math.max(1, page - 1), columns, limit, fields)}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
                  >
                    {t("prev_page")}
                  </Link>
                  <Link
                    href={pageHref(encoded, Math.min(pageCount, page + 1), columns, limit, fields)}
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
    </>
  );
}
