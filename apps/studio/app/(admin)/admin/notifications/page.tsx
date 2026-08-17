import { ErrorBanner } from "@/components/admin/error-banner";
import { NotificationsManager } from "@/components/admin/notifications-manager";
import { PageTabs } from "@/components/admin/page-tabs";
import { ReportRooms } from "@/components/admin/report-rooms";
import { getFormat, getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";
import type { Notification } from "@/lib/notifications/service";
import type { BugReport } from "@/lib/reports/service";

type Props = {
  searchParams: Promise<{ tab?: string; status?: string }>;
};

/**
 * お知らせ（F2 §2-F）。誰の通知かはサーバ側がセッションから決める。
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「お知らせページでは最初にタブで『**あなた宛**』『**システム関係**』があり、
 * >   **あなた宛がデフォルト**。システム関係はアップデートのことなど。
 * >   あくまでこれはお知らせ一覧なので、『不具合に返信がありました』や
 * >   『不具合が解決しました』などから**『報告一覧』のその報告チャットへ遷移**する。」
 *
 * 🚨 タブは**サーバ側で絞る**（`?category=`）。全部取ってから画面で隠す形にしない。
 */
export default async function NotificationsPage({ searchParams }: Props) {
  const t = await getT("notifications");
  const tError = await getT("errors");
  const params = await searchParams;

  // 既定は「あなた宛」。知らない値が来ても、あなた宛として扱う。
  const tab =
    params.tab === "system" ? "system" : params.tab === "reports" ? "reports" : "personal";
  const topTabs = [
    {
      href: "/admin/notifications?tab=personal",
      label: t("tab_personal"),
      current: tab === "personal",
    },
    {
      href: "/admin/notifications?tab=system",
      label: t("tab_system"),
      current: tab === "system",
    },
    {
      href: "/admin/notifications?tab=reports",
      label: t("tab_reports"),
      current: tab === "reports",
    },
  ];

  if (tab === "reports") {
    const tR = await getT("reports");
    const format = await getFormat();
    const status = params.status === "resolved" ? "resolved" : "open";
    const result = await apiFetch<{ data: BugReport[]; can_manage: boolean }>(
      `/api/reports?status=${status}`,
    );

    return (
      <div className="max-w-3xl space-y-6">
        <PageTabs tabs={topTabs} />

        <PageTabs
          tabs={[
            {
              href: "/admin/notifications?tab=reports&status=open",
              label: tR("tab_open"),
              current: status === "open",
            },
            {
              href: "/admin/notifications?tab=reports&status=resolved",
              label: tR("tab_resolved"),
              current: status === "resolved",
            },
          ]}
        />

        {result.ok ? (
          <ReportRooms
            reports={result.data.data}
            emptyLabel={status === "open" ? tR("empty_open") : tR("empty_resolved")}
            resolvedLabel={tR("tab_resolved")}
            formatDateTime={(value) => format.dateTime(value)}
          />
        ) : (
          <ErrorBanner message={tError(result.messageKey)} />
        )}
      </div>
    );
  }

  const result = await apiFetch<{ data: Notification[]; unread: number }>(
    `/api/notifications?category=${tab}`,
  );

  return (
    <div className="max-w-3xl space-y-6">
      <PageTabs tabs={topTabs} />

      {result.ok ? (
        <NotificationsManager
          notifications={result.data.data}
          unread={result.data.unread}
          category={tab}
          // 🚨 空の理由をタブごとに書き分ける。「あなた宛が無い」と
          //    「システムからのお知らせが無い」は読む人にとって別のこと。
          emptyLabel={tab === "system" ? t("empty_system") : t("empty")}
        />
      ) : (
        <ErrorBanner message={tError(result.messageKey)} />
      )}
    </div>
  );
}
