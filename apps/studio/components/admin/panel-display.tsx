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
import { PanelSection } from "@/components/admin/panel-section";
import { PanelError } from "@/components/admin/panel-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocale, useT } from "@/i18n/client";
import { fieldLabel } from "@/lib/schema/labels";
import { FilesViewOptions } from "@/components/admin/files-view-options";
import { FilesViewSwitch } from "@/components/admin/files-view-switch";
import {
  CARD_COLUMN_CHOICES,
  FILE_COLUMNS,
  readCardColumns,
  readColumns,
  type CardColumns,
  type FileColumn,
} from "@/lib/admin/files-view";

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
  // 🚨 `expired` … 401（セッション切れ）。もう一度押しても直らないので分けて持つ。
  | { status: "error"; collection: string; expired: boolean };

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

  if (pathname === "/admin/files") {
    return (
      <PanelSection value="display" title={t("display")}>
        <FilesPanelDisplay />
      </PanelSection>
    );
  }

  if (collection === null) return null;

  return (
    <PanelSection value="display" title={t("display")}>
      <PanelDisplayControls collection={collection} pathname={pathname} />
    </PanelSection>
  );
}

function FilesPanelDisplay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "table" ? "table" : "grid";
  const columns = readColumns(searchParams.get("cols") ?? undefined);
  const cardColumns = readCardColumns(searchParams.get("cards") ?? undefined);

  const hrefWithQuery = (key: string, value: string | null): string => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const columnHref = Object.fromEntries(
    FILE_COLUMNS.map((column) => {
      const next = columns.includes(column)
        ? columns.filter((one) => one !== column)
        : FILE_COLUMNS.filter((one) => columns.includes(one) || one === column);
      return [column, hrefWithQuery("cols", next.join(","))];
    }),
  ) as Record<FileColumn, string>;

  const gridCardColumnsHref = Object.fromEntries(
    CARD_COLUMN_CHOICES.map((count) => [count, hrefWithQuery("cards", String(count))]),
  ) as Record<CardColumns, string>;

  const tableHref = hrefWithQuery("view", "table");
  const gridHref = hrefWithQuery("view", null);

  return (
    <div className="flex max-w-full flex-col gap-4 overflow-x-auto">
      <FilesViewSwitch
        view={view}
        tableHref={tableHref}
        gridHref={gridHref}
        cardColumns={cardColumns}
        gridCardColumnsHref={gridCardColumnsHref}
      />
      <FilesViewOptions view={view} columns={columns} columnHref={columnHref} />
    </div>
  );
}

function PanelDisplayControls({
  collection,
  pathname,
}: {
  collection: string;
  pathname: string;
}) {
  const locale = useLocale();
  const t = useT("panel");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<FieldsState>({ status: "loading", collection });
  // 🚨 **もう一度読み込めるようにする**（司令塔の「途中で失敗したとき」②）。
  const [reload, setReload] = useState(0);
  // 🚨 押した手応え（実測: 押しても見た目が変わらないと、人はもう一度押す）。
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/fields/${encodeURIComponent(collection)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        // 🚨 **失敗を Error の文言で運ばない。** 状態はここで決めて、下へは null を渡す。
        //    以前は `throw new Error("unauthenticated")` にしていたが、`check-raw-api-message` が
        //    `error.message` を「API の生文言を画面へ流している」として止めた（実測: exit 1）。
        //    門の言い分が正しい——**文字列で分岐する形そのものが危うい**ので、状態で持つ。
        if (!response.ok) {
          setState({ status: "error", collection, expired: response.status === 401 });
          setPending(false);
          return null;
        }
        return (await response.json()) as FieldResult[];
      })
      .then((fields) => {
        if (fields === null) return;
        // 🚨 応答が返ったら押した手応えを下ろす。
        setPending(false);
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
        // 🚨 ここへ来るのは通信が切れた側。**「もう一度」で直りうる**ので expired にしない。
        setState({ status: "error", collection, expired: false });
        setPending(false);
      });

    return () => controller.abort();
  }, [collection, reload]);

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
        <p className="text-base text-muted-foreground">{t("display_loading")}</p>
      ) : status === "error" ? (
        // 🚨 **取れなかった**とき。実際に出ることを実測済み（セッションが切れた状態でパネルを開くと 401）。
        <PanelError
          message={t("display_error")}
          expired={isCurrent && state.status === "error" && state.expired}
          pending={pending}
          onRetry={() => {
            setPending(true);
            setReload((n) => n + 1);
          }}
        />
      ) : fields.length === 0 ? (
        // 🚨 **取れたが候補が無い**とき。上の「取れなかった」と**別の文言**にする。
        //    同じ見た目にすると「列が無い」と「列を取りに行けていない」が区別できない
        //    （`/api/fields/<存在しないコレクション>` は 404 ではなく 200 [] を返すので、実際に起きる）。
        <p className="text-base text-muted-foreground">{t("display_empty")}</p>
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
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(nextChecked) => {
                        writeColumns(
                          nextChecked === true
                            ? [...fieldNames(selectedColumns), field.field]
                            : fieldNames(selectedColumns).filter((item) => item !== field.field),
                        );
                      }}
                      className="size-4 shrink-0"
                    />
                    {/* 🚨 見出しと同じ辞書を通す（一覧と列選択で名前が食い違わないように）。 */}
                    <span className="min-w-0 truncate">{fieldLabel(field, locale)}</span>
                  </label>
                );
              })}
            </div>
          </section>

          {/*
            🚨 **ここに線を足さない**（DESIGN.md §1-3）。
               「列を選ぶ」と「表示件数」は小見出しどうし＝「項目どうしの間」で、
               2026-08-15 に堀池さんが外した側の線（別の要素に見えてしまう）。
               間隔は親の `gap-4` が持つ（同 §1-3 追記「Divier、space-y をちゃんと活用」）。
          */}
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
