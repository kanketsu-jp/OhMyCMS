"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { FieldResult } from "@/lib/schema/models";
import {
  DEFAULT_COLUMN_COUNT,
  DEFAULT_LIST_LIMIT,
  LIST_LIMITS,
  resolveColumns,
  resolveLimit,
} from "@/lib/admin/list-view";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/i18n/client";

/**
 * 右サイドバー ③「表示・切り替え」の中身。
 *
 * 由来（idea.md L60・堀池の原文）:
 *   「表示・切り替え（**列の数**や、データテーブル・カレンダー・カンバン などなど他の表示ができる。
 *     これはソースコードレベル＋行式ドキュメントなどで **Directus を参考に**して。）」
 *
 * 🚨 **説明パネルではなく操作パネル**として作った。「テーブル表示です」と書くだけなら
 *    ③をやったことにならない（それは「準備中」の言い換え）。
 *
 * 🚨 **選択は state に持たず、URL を正本として読む**（`useSearchParams`）。
 *    state と URL の二重管理にすると必ずどちらかが腐り、**共有した URL を開いた人の
 *    パネルが嘘をつく**（チェックは入っているのに表の列が違う、等）。
 *
 * 🚨 **一覧ページ以外では `null` を返し、枠ごと出さない**（①概要と同じ規律）。
 *    「準備中」を出すと、**表示形式が無いページと、書き忘れたページの区別が付かない**。
 *
 * 🚨 右パネルは PC の3列目で**幅が狭い**。溢れるときは**自分のコンテナで横スクロール**させる
 *    （ページ本体を横スクロールさせない）。面は積まない（.claude/design-perf-charter.md §1）。
 *
 * Directus から**真似なかったもの**: presets / ブックマーク（保存先の表が無い）、
 * Map・Cards レイアウト（地理列・画像の規約が要る）、密度（面と余白は design の領域）。
 * カレンダー・カンバンは**範囲B**として別タスクにした（形式ごとに設計が別物で、
 * 1つに混ぜるとどれも半端になる）。
 */
type FieldsState =
  | { status: "loading"; collection: string }
  | { status: "ready"; collection: string; fields: FieldResult[] }
  | { status: "error"; collection: string };

const EMPTY_FIELDS: FieldResult[] = [];

function collectionFromPathname(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 3) return null;
  if (segments[0] !== "admin" || segments[1] !== "content") return null;
  return segments[2] ?? null;
}

function sameFields(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function fieldNames(fields: readonly FieldResult[]): string[] {
  return fields.map((field) => field.field);
}

export function PanelDisplay() {
  const t = useT("panel");
  const pathname = usePathname();
  const collection = collectionFromPathname(pathname);

  if (collection === null) return null;

  return (
    <AccordionItem value="display">
      <AccordionTrigger>{t("display")}</AccordionTrigger>
      <AccordionContent>
        <PanelDisplayControls collection={collection} pathname={pathname} />
      </AccordionContent>
    </AccordionItem>
  );
}

function PanelDisplayControls({
  collection,
  pathname,
}: {
  collection: string;
  pathname: string;
}) {
  const t = useT("panel");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<FieldsState>({ status: "loading", collection });

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/fields/${encodeURIComponent(collection)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("fields fetch failed");
        return (await response.json()) as FieldResult[];
      })
      .then((fields) => {
        setState({
          status: "ready",
          collection,
          // 🚨 hidden の列は「表示する列」の候補にも出さない（一覧側と同じ規則）。
          //    出すと、内部用の `<field>_plain` を利用者が表へ足せてしまう。
          fields: fields.filter((field) => Boolean(field.schema) && !field.meta?.hidden),
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", collection });
      });

    return () => controller.abort();
  }, [collection]);

  const isCurrent = state.collection === collection;
  const fields = isCurrent && state.status === "ready" ? state.fields : EMPTY_FIELDS;
  const status = isCurrent ? state.status : "loading";
  const selectedColumns = useMemo(
    () => resolveColumns(searchParams.get("cols") ?? undefined, fields),
    [searchParams, fields],
  );
  const selectedNames = useMemo(() => new Set(fieldNames(selectedColumns)), [selectedColumns]);
  const limit = resolveLimit(searchParams.get("limit") ?? undefined);

  const replaceQuery = (next: URLSearchParams) => {
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const writeColumns = (names: readonly string[]) => {
    const allowed = new Set(names);
    const nextNames = fields.filter((field) => allowed.has(field.field)).map((field) => field.field);
    const defaultNames = fieldNames(fields.slice(0, DEFAULT_COLUMN_COUNT));
    const next = new URLSearchParams(searchParams);
    next.delete("page");
    if (nextNames.length === 0 || sameFields(nextNames, defaultNames)) {
      next.delete("cols");
    } else {
      next.set("cols", nextNames.join(","));
    }
    replaceQuery(next);
  };

  const writeLimit = (nextLimit: number) => {
    const next = new URLSearchParams(searchParams);
    next.delete("page");
    if (nextLimit === DEFAULT_LIST_LIMIT) next.delete("limit");
    else next.set("limit", String(nextLimit));
    replaceQuery(next);
  };

  return (
    <div className="flex max-w-full flex-col gap-4 overflow-x-auto">
      {status === "loading" ? (
        <p className="text-sm text-muted-foreground">{t("display_loading")}</p>
      ) : status === "error" ? (
        // 🚨 **取れなかった**とき。実際に出ることを実測済み（セッションが切れた状態でパネルを開くと 401）。
        <p className="text-sm text-muted-foreground">{t("display_error")}</p>
      ) : fields.length === 0 ? (
        // 🚨 **取れたが候補が無い**とき。上の「取れなかった」と**別の文言**にする。
        //    同じ見た目にすると「列が無い」と「列を取りに行けていない」が区別できない
        //    （`/api/fields/<存在しないコレクション>` は 404 ではなく 200 [] を返すので、実際に起きる）。
        <p className="text-sm text-muted-foreground">{t("display_empty")}</p>
      ) : (
        <>
          <section className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h3 className="truncate text-sm font-medium">{t("display_columns_heading")}</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => writeColumns(fieldNames(fields))}
              >
                {t("display_select_all")}
              </Button>
            </div>
            <div className="flex min-w-0 flex-col">
              {fields.map((field) => {
                const checked = selectedNames.has(field.field);
                return (
                  <label
                    key={field.field}
                    className="flex min-h-(--control-h) min-w-0 items-center gap-2 text-sm md:min-h-(--control-h-pc)"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        writeColumns(
                          event.target.checked
                            ? [...fieldNames(selectedColumns), field.field]
                            : fieldNames(selectedColumns).filter((item) => item !== field.field),
                        );
                      }}
                      className="size-4 shrink-0"
                    />
                    <span className="min-w-0 truncate">{field.field}</span>
                  </label>
                );
              })}
            </div>
          </section>

          <Separator />

          <section className="flex min-w-0 flex-col gap-2">
            <h3 className="text-sm font-medium">{t("display_limit_heading")}</h3>
            <div className="flex min-w-0 flex-col">
              {LIST_LIMITS.map((item) => (
                <label
                  key={item}
                  className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)"
                >
                  <input
                    type="radio"
                    name="panel-display-limit"
                    value={item}
                    checked={limit === item}
                    onChange={() => writeLimit(item)}
                    className="size-4 shrink-0"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
