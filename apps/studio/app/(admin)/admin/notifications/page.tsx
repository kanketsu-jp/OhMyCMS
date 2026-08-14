import { ErrorBanner } from "@/components/admin/error-banner";
import { NotificationsManager } from "@/components/admin/notifications-manager";
import { apiFetch } from "@/lib/admin/api";
import type { Notification } from "@/lib/notifications/service";

/** 自分宛の通知（F2 §2-F）。誰の通知かはサーバ側がセッションから決める。 */
export default async function NotificationsPage() {
  const result = await apiFetch<{ data: Notification[]; unread: number }>(
    "/api/notifications",
  );

  return (
    <div className="max-w-3xl space-y-6">

      {result.ok ? (
        <NotificationsManager
          notifications={result.data.data}
          unread={result.data.unread}
        />
      ) : (
        <ErrorBanner message={result.message} />
      )}
    </div>
  );
}
