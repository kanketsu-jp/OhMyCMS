import { BugReportAction } from "@/components/admin/bug-report-action";
import { ErrorBanner } from "@/components/admin/error-banner";
import { PageTabs } from "@/components/admin/page-tabs";
import { ReportRooms } from "@/components/admin/report-rooms";
import { getFormat, getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";
import type { BugReport } from "@/lib/reports/service";

type Props = {
  searchParams: Promise<{ status?: string; scope?: string }>;
};

/**
 * 報告一覧（自分が出した報告）。
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「**報告一覧では未解決のチャットルームが並ぶ**。ページ最初（上部）には
 * >   『未解決』『解決済み』のタブ。」
 *
 * → 既定は**未解決**。「一覧を開いた人がまず見たいのは、まだ終わっていないもの」。
 *
 * 🚨 **見出しを置かない**（パンくずがページ名を出す）。概要は右サイドバーの「info」。
 */
export default async function ReportsPage({ searchParams }: Props) {
  const t = await getT("reports");
  const tError = await getT("errors");
  const format = await getFormat();
  const params = await searchParams;

  // 既定は未解決。知らない値が来たら未解決として扱う（壊れた URL で空にしない）。
  const status = params.status === "resolved" ? "resolved" : "open";

  /**
   * 🚨 **「全員の報告」は別の画面ではなく、同じ一覧の範囲違い**
   *    （`decisions/list-views-are-switchable-layouts` §3・§8）。
   *    以前は `/admin/reports/manage` という**4 つ目の画面**だったが、
   *    中身の差は **`scope=all` の 1 つだけ**だった。
   *    ＝ 画面を分けると、**同じ一覧の描き方が 2 箇所に散る**（片方だけ直る事故が起きる）。
   *
   * 🚨 **知らない値は自分の分へ落とす。** 壊れた URL で他人の報告を出さない
   *    （API 側は `scope=all` に権限を要求するので、**画面が緩くても漏れない**——
   *    それでも**画面の既定を緩くしない**）。
   */
  const scope = params.scope === "all" ? "all" : "mine";

  const list = await apiFetch<{ data: BugReport[]; can_manage: boolean }>(
    `/api/reports?status=${status}${scope === "all" ? "&scope=all" : ""}`,
  );

  /** その範囲のまま、状態だけ切り替える行き先。 */
  const statusHref = (next: "open" | "resolved"): string =>
    `/admin/reports?status=${next}${scope === "all" ? "&scope=all" : ""}`;

  return (
    <div className="max-w-3xl space-y-6">
      <BugReportAction label={t("nav_create")} />

      <PageTabs
        tabs={[
          { href: statusHref("open"), label: t("tab_open"), current: status === "open" },
          {
            href: statusHref("resolved"),
            label: t("tab_resolved"),
            current: status === "resolved",
          },
        ]}
      />

      {/*
        🚨 **範囲の切り替えは、扱える人にだけ出す**（`can_manage`）。
           出しておいて押すと 403、は「在るのに押せない」——今日決めた形の反対。
           （`decisions/list-views-are-switchable-layouts` の base2 の観察:
             **タブを常に出して無効にする、をやらない**）
      */}
      {list.ok && list.data.can_manage ? (
        <PageTabs
          tabs={[
            {
              href: `/admin/reports?status=${status}`,
              label: t("scope_mine"),
              current: scope === "mine",
            },
            {
              href: `/admin/reports?status=${status}&scope=all`,
              label: t("scope_all"),
              current: scope === "all",
            },
          ]}
        />
      ) : null}

      {list.ok ? (
        <ReportRooms
          reports={list.data.data}
          // 🚨 空の理由をタブごとに書き分ける。「未解決が無い」と「解決済みが無い」は
          //    利用者にとって意味が違う（前者は良い知らせ）。
          emptyLabel={status === "open" ? t("empty_open") : t("empty_resolved")}
          resolvedLabel={t("tab_resolved")}
          formatDateTime={(value) => format.dateTime(value)}
        />
      ) : (
        // 🚨 これは「まだ続いている状態」なので、その場に出す（トーストにしない）。
        <ErrorBanner message={tError(list.messageKey)} />
      )}
    </div>
  );
}
