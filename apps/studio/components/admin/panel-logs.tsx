"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { PanelSection } from "@/components/admin/panel-section";
import { PanelError } from "@/components/admin/panel-error";
import { useFormat, useT } from "@/i18n/client";
import type { Translator } from "@/i18n/translator";

/**
 * 右サイドバー⑤「ログ・履歴」の中身。
 *
 * 由来: `docs/design/panel-logs-history.md` §3-4（設計）。作法は
 * `components/admin/panel-display.tsx` を手本にした（"use client" / pathname から
 * collection を出す / 一覧ページ以外は `null` を返し枠ごと出さない / 幅が狭いので
 * 自分のコンテナで横スクロール / `useT` で i18n）。
 *
 * 🚨 **`GET /api/activity` は認証+"log"権限で gate 済み**（AGENTS.md §3.5 — サーバ側で拒否）。
 *    403 が返ったら**このパネルごと出さない**（trigger も含めて `null`）。
 *    権限が無い人に「読み込めませんでした」のようなエラーを見せると、
 *    「権限が無い」と「一時的に取れない」の区別がヒントになってしまう。
 *
 * 🚨 **「まだ記録がありません」（200件・0件）と「読み込めませんでした」（エラー）は別の文言。**
 *    『無い』と『取れない』を同じ見た目にしない（設計 §3-4）。
 */

type ActivityEntry = {
  action: string;
  timestamp: string;
  item: string;
  user: string | null;
  actor_type: string;
};

type LogsState =
  | { status: "loading"; key: string }
  | { status: "forbidden"; key: string }
  // 🚨 `expired` … 401（セッション切れ）。もう一度押しても直らないので分けて持つ。
  | { status: "error"; key: string; expired: boolean }
  | { status: "empty"; key: string }
  | { status: "list"; key: string; entries: ActivityEntry[] };

/**
 * pathname から collection を出す。panel-display.tsx の `collectionFromPathname` と同じ判定。
 * `/admin/content/<collection>` と `/admin/content/<collection>/<id>` の両方を受ける。
 */
function collectionFromPathname(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 3 && segments.length !== 4) return null;
  if (segments[0] !== "admin" || segments[1] !== "content") return null;
  return segments[2] ?? null;
}

/** pathname から item id を出す。`/admin/content/<collection>/<id>`（4セグメント）のときだけ値を返す。 */
function itemFromPathname(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 4) return null;
  if (segments[0] !== "admin" || segments[1] !== "content") return null;
  return segments[3] ?? null;
}

function activityKey(collection: string, item: string | null): string {
  return `${collection}:${item ?? ""}`;
}

export function PanelLogs() {
  const pathname = usePathname();
  const collection = collectionFromPathname(pathname);

  if (collection === null) return null;

  const item = itemFromPathname(pathname);

  return <PanelLogsAccordionItem collection={collection} item={item} />;
}

function actionLabel(t: Translator, action: string): string {
  switch (action) {
    case "create":
      return t("history_action_create");
    case "update":
      return t("history_action_update");
    case "delete":
      return t("history_action_delete");
    default:
      return action;
  }
}

function PanelLogsAccordionItem({
  collection,
  item,
}: {
  collection: string;
  item: string | null;
}) {
  const t = useT("panel");
  const format = useFormat();
  const key = activityKey(collection, item);
  const [state, setState] = useState<LogsState>({ status: "loading", key });
  // 🚨 **もう一度読み込めるようにする**（司令塔の「途中で失敗したとき」②）。
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ collection });
    if (item) params.set("item", item);

    void fetch(`/api/activity?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 403) {
          setState({ status: "forbidden", key });
          return;
        }
        if (!response.ok) {
          // 🚨 401 だけ分ける（「もう一度」では直らない）。403 は上で `forbidden` として扱っている。
          setState({ status: "error", key, expired: response.status === 401 });
          return;
        }
        const body = (await response.json()) as { data: ActivityEntry[] };
        setState(
          body.data.length === 0
            ? { status: "empty", key }
            : { status: "list", key, entries: body.data },
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // 🚨 通信が切れた側。ここは「もう一度」で直りうる。
        setState({ status: "error", key, expired: false });
      });

    return () => controller.abort();
  }, [collection, item, key, reload]);

  // 🚨 pathname が切り替わった直後、前の collection/item の結果が一瞬残らないよう、
  //    key が食い違うあいだは loading 扱いにする（panel-display.tsx の isCurrent と同じ考え方）。
  const current = state.key === key ? state : ({ status: "loading", key } as const);

  if (current.status === "forbidden") return null;

  return (
    <PanelSection value="history" title={t("history")}>
        {current.status === "loading" ? (
          <p className="text-sm text-muted-foreground">{t("history_loading")}</p>
        ) : current.status === "error" ? (
          <PanelError
            message={t("history_error")}
            expired={current.status === "error" && current.expired}
            onRetry={() => setReload((n) => n + 1)}
          />
        ) : current.status === "empty" ? (
          <p className="text-sm text-muted-foreground">{t("history_empty")}</p>
        ) : (
          <ul className="flex max-w-full flex-col gap-1 overflow-x-auto">
            {current.entries.map((entry, index) => (
              <li
                key={`${entry.item}-${entry.timestamp}-${index}`}
                className="flex min-w-max items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-sm"
              >
                <span className="font-medium">{actionLabel(t, entry.action)}</span>
                <span className="text-muted-foreground">
                  {format.dateTime(entry.timestamp)}
                </span>
                <span className="text-muted-foreground">
                  {entry.user ?? t("history_who_unknown")}
                </span>
              </li>
            ))}
          </ul>
        )}
    </PanelSection>
  );
}
