"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormat, useT } from "@/i18n/client";

type Notification = {
  id: string;
  message_key: string;
  message_params: Record<string, unknown> | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};

/**
 * 自分宛の通知（F2 §2-F）。
 *
 * 🚨 通知の**文言は辞書キーで保存されている**（DB に翻訳済みの文字列を入れない）。
 *    ここで辞書を引くので、言語を切り替えると過去の通知も切り替わる。
 *    辞書に無いキーが来たらキーをそのまま出す（画面が空白になるより追える）。
 */
export function NotificationsManager({
  notifications,
  unread,
}: {
  notifications: Notification[];
  unread: number;
}) {
  const t = useT("notifications");
  const format = useFormat();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  async function setRead(id: string, read: boolean) {
    setError(null);
    const response = await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ read }),
    });
    if (!response.ok) {
      setError(t("error_update_failed"));
      return;
    }
    router.refresh();
  }

  const visible = unreadOnly ? notifications.filter((n) => !n.read_at) : notifications;

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {t("unread_badge", { count: unread })}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setUnreadOnly((v) => !v)}>
          {unreadOnly ? t("show_all") : t("show_unread_only")}
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((notification) => (
            <li
              key={notification.id}
              className={`flex items-start justify-between gap-4 rounded-lg border px-3 py-2 ${
                notification.read_at ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm">
                  {/* 辞書に無いキーは翻訳器がキーをそのまま返す。空白にはしない。 */}
                  {t(
                    notification.message_key,
                    (notification.message_params ?? {}) as Record<string, string | number>,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format.dateTime(notification.created_at)}
                </p>
                {notification.link ? (
                  <Link
                    href={notification.link}
                    className="text-xs underline underline-offset-4"
                  >
                    {t("open_link")}
                  </Link>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRead(notification.id, !notification.read_at)}
              >
                {notification.read_at ? <Undo2 /> : <Check />}
                {notification.read_at ? t("mark_unread") : t("mark_read")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
