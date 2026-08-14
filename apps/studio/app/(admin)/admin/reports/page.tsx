import { BugReportAction } from "@/components/admin/bug-report-action";
import { ErrorBanner } from "@/components/admin/error-banner";
import { PageTabs } from "@/components/admin/page-tabs";
import { ReportRooms } from "@/components/admin/report-rooms";
import { getFormat, getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";
import type { BugReport } from "@/lib/reports/service";

type Props = {
  searchParams: Promise<{ status?: string }>;
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
  const format = await getFormat();
  const params = await searchParams;

  // 既定は未解決。知らない値が来たら未解決として扱う（壊れた URL で空にしない）。
  const status = params.status === "resolved" ? "resolved" : "open";

  const list = await apiFetch<{ data: BugReport[]; can_manage: boolean }>(
    `/api/reports?status=${status}`,
  );

  return (
    <div className="max-w-3xl space-y-6">
      <BugReportAction label={t("nav_create")} />

      <PageTabs
        tabs={[
          { href: "/admin/reports?status=open", label: t("tab_open"), current: status === "open" },
          {
            href: "/admin/reports?status=resolved",
            label: t("tab_resolved"),
            current: status === "resolved",
          },
        ]}
      />

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
        <ErrorBanner message={list.message} />
      )}
    </div>
  );
}
