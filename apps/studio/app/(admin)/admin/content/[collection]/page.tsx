import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import type { FieldResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { FieldDisplay, type DisplayLookup } from "@/components/admin/field-display";
import { ItemCards } from "@/components/admin/item-cards";
import { isFileField } from "@/lib/schema/interfaces";
import { ColumnPicker } from "@/components/admin/column-picker";
import { ClickableRow } from "@/components/admin/clickable-row";
import { ErrorBanner } from "@/components/admin/error-banner";
import { ListEmpty } from "@/components/admin/list-empty";
import { PageAction } from "@/components/admin/page-action";
import { sectionAnchorId } from "@/components/admin/page-sections";
import { RowOptions } from "@/components/admin/row-options";
import { errorKeyFromQuery } from "@/i18n/error";
import { getLocale, getT } from "@/i18n/server";
import { fieldLabel } from "@/lib/schema/labels";
import { DEFAULT_LIST_LAYOUT, resolveLayout, type ListLayoutId } from "@/lib/admin/list-layouts";
import {
  DEFAULT_COLUMN_COUNT,
  DEFAULT_LIST_LIMIT,
  resolveColumns,
  resolveLimit,
} from "@/lib/admin/list-view";
import { buttonVariants } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { WideTable } from "@/components/admin/wide-table";
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
  searchParams: Promise<{
    page?: string;
    error?: string;
    notice?: string;
    cols?: string;
    limit?: string;
    layout?: string | string[];
  }>;
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
  layout: ListLayoutId,
  page: number,
  columns: FieldResult[],
  limit: number,
  fields: FieldResult[],
): string {
  const query = new URLSearchParams({ page: String(page) });
  if (layout !== DEFAULT_LIST_LAYOUT) query.set("layout", layout);
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

/**
 * その欄を**入れ替えた**ときの行き先。
 *
 * 🚨 **1 ページ目へ戻す。** 列を変えると**行の内容が変わって見える**ので、
 *   5 ページ目のまま列だけ変わると「**どこを見ていたか**」が分からなくなる。
 *   （`limit` は保つ——**1 ページに何件出すかは列と関係ない**）
 *
 * 🚨 **最後の 1 本は外せない**ので `null` を返す。
 *   `resolveColumns` は **0 本になると既定（先頭 8 本）へ戻す**ので、外せるように見せると
 *   「**外したのに 8 本戻ってくる**」になる。＝ **できないことを、できそうに見せない**。
 */
function columnToggleHref(
  encoded: string,
  layout: ListLayoutId,
  field: FieldResult,
  columns: FieldResult[],
  limit: number,
  fields: FieldResult[],
): string | null {
  const on = columns.some((one) => one.field === field.field);
  if (on && columns.length === 1) return null;
  // 🚨 並びは `fields` の順に揃える（`resolveColumns` と同じ規則。
  //    URL に書かれた順を信じると、同じ選択で URL が何通りもできる）。
  const next = on
    ? columns.filter((one) => one.field !== field.field)
    : fields.filter((one) => one.field === field.field || columns.some((c) => c.field === one.field));
  return pageHref(encoded, layout, 1, next, limit, fields);
}

export default async function ContentPage({ params, searchParams }: Props) {
  const locale = await getLocale();
  const t = await getT("items");
  const tFields = await getT("fields");
  const { collection } = await params;
  const query = await searchParams;
  // 🚨 URL の値は鍵としてしか受け取らない（許可リスト・fail closed）。i18n/error.ts 参照。
  const tError = await getT("errors");
  const errorKey = errorKeyFromQuery(query.error);
  const errorMessage = errorKey ? tError(errorKey) : null;
  const page = Math.max(1, Number(query.page ?? "1") || 1);
  const layout = resolveLayout(query.layout);
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
  /**
   * この表の削除が**論理削除になるか**。
   *
   * 🚨 `lib/items/service.ts` は **`deleted_at` の列が在る表だけ**論理削除にし、
   *   **無い表は物理削除のまま**（列は「登録が在り、主キーが在る表」にしか付かない）。
   *   ＝ **同じ「削除」ボタンが、表によって戻せたり戻せなかったりする**。
   * 🚨 判定に使うのは **`fieldsResult.data`（未フィルタ）**。
   *   上の `fields` は `meta.hidden` を落としており、**`deleted_at` は hidden なので入っていない**。
   */
  /** 「出す項目」に並べる選択肢。🚨 **`href: null` は外せない項目**（最後の 1 本）。 */
  const columnChoices = fields.map((field) => ({
    key: field.field,
    label: fieldLabel(field, locale),
    href: columnToggleHref(encoded, layout, field, columns, limit, fields),
    checked: columns.some((one) => one.field === field.field),
  }));
  const softDeletes = fieldsResult.ok
    ? fieldsResult.data.some((field) => field.field === "deleted_at")
    : false;
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
            (!fieldsResult.ok ? tError(fieldsResult.messageKey) : null) ??
            (!itemsResult.ok ? tError(itemsResult.messageKey) : null)
          }
        />
        <Surface id={sectionAnchorId("items.list_title")}>
          {/* 🚨 見出しは出さない（堀池・2026-08-15「「〜一覧」の見出しは全部消す」）。
            見て分かるものに名前を付けない。**右サイドバーの「項目一覧」には出る**ので、
            辞書の鍵は消さないこと（消すと項目一覧の名前が消える）。 */}
          {/* 🚨 「出す項目」。堀池指示「**また列が選択できないし**」（files では直したが、
              ここは **`?cols=` の状態だけ在って触る操作が無かった**）。 */}
          {columnChoices.some((choice) => choice.href !== null) || columns.length < fields.length ? (
            <div className="mb-3 flex items-center justify-end gap-1">
              {/* 🚨 **出していない欄が在るときだけ**知らせる。
                  全部出しているときの「N 個のうち N 個」は、何も伝えていない
                  （`every-element-must-earn-its-place`。**足した理由が
                  「出していない欄が在ることを知らせる」だった**ので、無いときは出さない）。 */}
              {columns.length < fields.length ? (
                <span className="mr-auto text-xs text-muted-foreground">
                  {t("columns_shown", { shown: columns.length, total: fields.length })}
                </span>
              ) : null}
              {/* 🚨 **押せる項目が 1 つも無いなら、メニューごと出さない**（2026-08-17）。
                  由来: base2 が `zz_probe_dialog`（**欄 1 本**）で押して「項目 0 件」を見つけた。
                  欄が 1 本のとき、その 1 本は**最後の 1 本なので外せない**（押せない行になる）
                  ＝ 🚨 **開いても何もできないメニュー**。**私が自分で禁じた形**
                  （「選ぶものが無いメニューを置かない」——**欄 0 本のときだけ見ていて、
                    「欄は在るが動かせない」を見落としていた**）。 */}
              {columnChoices.some((choice) => choice.href !== null) ? (
                <ColumnPicker label={t("options_columns")} choices={columnChoices} />
              ) : null}
            </div>
          ) : null}
          {itemsResult.ok ? (
            <>
              <div data-list-layout={layout}>
                {layout === "cards" ? (
                  <ItemCards
                    items={itemsResult.data.data}
                    columns={columns}
                    pk={pk}
                    collection={collection}
                    lookup={lookup}
                  />
                ) : (
                  <WideTable>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {/* 🚨 欄名は辞書を通す（設問286 A）。辞書が無ければ fieldLabel が
                              生の識別子に落ちるので、名前を付けるまで表示は変わらない。
                              各所で `?? field.field` と書くと必ず割れるので、必ずこの関数を通す。 */}
                          {columns.map((field) => (
                            <TableHead key={field.field}>{fieldLabel(field, locale)}</TableHead>
                          ))}
                          <TableHead className="w-44">{t("actions_header")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemsResult.data.data.map((item, index) => {
                          const id = String(item[pk] ?? "");
                          return (
                            <ClickableRow key={id || index} href={`/admin/content/${encoded}/${encodeURIComponent(id)}`}>
                              {columns.map((field) => (
                                <TableCell key={field.field} className="max-w-64 truncate">
                                  <FieldDisplay field={field} value={item[field.field]} lookup={lookup} />
                                </TableCell>
                              ))}
                              <TableCell>
                                {/* 🚨 行の操作が 2 つ以上なら、破壊的なほうは ▾ の中へ
                                    （`knowledge/decisions/action-button-and-edit-mode.md`）。
                                    🚨 form は**残す**。`RowOptions` の `formId` が指す相手そのもので、
                                       消すと削除が黙って効かなくなる（中身は隠し項目だけでよい）。 */}
                                <div className="flex gap-1">
                                  <Link
                                    href={`/admin/content/${encoded}/${encodeURIComponent(id)}`}
                                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                                  >
                                    {t("edit_button")}
                                  </Link>
                                  <form
                                    id={`item-delete-${id}`}
                                    action={`/admin/actions/items/${encoded}/${encodeURIComponent(id)}`}
                                    method="post"
                                  >
                                    <input type="hidden" name="_method" value="delete" />
                                  </form>
                                  <RowOptions
                                    label={t("row_options")}
                                    options={[
                                      {
                                        label: t("delete_button"),
                                        icon: <Trash2 />,
                                        destructive: true,
                                        formId: `item-delete-${id}`,
                                        // 🚨 **戻せるかが表によって違う**ので、文面も色も分ける
                                        //    （`knowledge/decisions/confirm-by-reversibility-and-reach`）。
                                        //    【測った 2026-08-17】15 コレクション中 14 本に `deleted_at` が在り、
                                        //    **1 本（`zz_probe_dialog`）には無い** ＝ **同じボタンが物理削除に落ちる**。
                                        confirm: {
                                          title: t("delete_confirm_title"),
                                          description: softDeletes
                                            ? t("delete_confirm_soft")
                                            : t("delete_confirm_hard"),
                                          confirmLabel: t("delete_button"),
                                          tone: softDeletes ? "default" : "danger",
                                        },
                                      },
                                    ]}
                                  />
                                </div>
                              </TableCell>
                            </ClickableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </WideTable>
                )}
              </div>
              {/* 🚨 1 件も無いことを、表の枠だけで伝えない。
                  読み込めていないのか、まだ無いのかが分からない。 */}
              {itemsResult.data.data.length === 0 ? <ListEmpty>{t("empty")}</ListEmpty> : null}
              <div className="mt-4 flex items-center justify-between text-sm">
                <span>{t("pagination_summary", { total, from: offset + 1, to: Math.min(offset + limit, total) })}</span>
                <div className="flex gap-2">
                  <Link
                    href={pageHref(encoded, layout, Math.max(1, page - 1), columns, limit, fields)}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
                  >
                    {t("prev_page")}
                  </Link>
                  <Link
                    href={pageHref(encoded, layout, Math.min(pageCount, page + 1), columns, limit, fields)}
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
