import { notFound } from "next/navigation";

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
 * 報告管理（**全員の報告**）。
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「不具合のポリシーで『管理（閲覧、更新、編集、削除が含まれる）』の場合のみ、
 * >   左サイドバーでは『不具合報告』のアコーディオンに、
 * >   『報告する』『**報告管理**』（**報告一覧はない**）があるようにする。」
 * > 「管理者の『報告管理』ページには**全てのチャット**が表示。」
 *
 * 🚨 **左サイドバーに出さないだけで済ませない。** 権限が無い人がこの URL を直に開いたら
 *    `/api/reports?scope=all` が 403 を返すので、**ページごと 404 にする**
 *    （`AGENTS.md §3.5`「権限はフィルタで隠すのでなく、サーバ側で拒否する」）。
 *    403 ではなく 404 にするのは、**この画面があること自体を教えない**ため。
 */
export default async function ReportsManagePage({ searchParams }: Props) {
  const t = await getT("reports");
  const tError = await getT("errors");
  const format = await getFormat();
  const params = await searchParams;

  const status = params.status === "resolved" ? "resolved" : "open";

  const list = await apiFetch<{ data: BugReport[]; can_manage: boolean }>(
    `/api/reports?scope=all&status=${status}`,
  );

  // 権限が無ければ API が 403。画面としては「無い」ものとして返す。
  if (!list.ok && list.status === 403) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <PageTabs
        tabs={[
          {
            href: "/admin/reports/manage?status=open",
            label: t("tab_open"),
            current: status === "open",
          },
          {
            href: "/admin/reports/manage?status=resolved",
            label: t("tab_resolved"),
            current: status === "resolved",
          },
        ]}
      />

      {list.ok ? (
        <ReportRooms
          reports={list.data.data}
          emptyLabel={status === "open" ? t("empty_open") : t("empty_resolved")}
          resolvedLabel={t("tab_resolved")}
          formatDateTime={(value) => format.dateTime(value)}
        />
      ) : (
        <ErrorBanner message={tError(list.messageKey)} />
      )}
    </div>
  );
}
