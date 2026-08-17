"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CheckCheck, Undo2 } from "lucide-react";

import { ListEmpty } from "@/components/admin/list-empty";
import { PageAction } from "@/components/admin/page-action";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useFormat, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

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
 *
 * 🚨 **1件ずつを枠で囲まない**（堀池さん「カードコンポーネントを多用するのはデザインスキルが低い」）。
 *    並んでいるものの区切りは罫線 1 本で足りる。
 */
export function NotificationsManager({
  notifications,
  unread,
  category,
  emptyLabel,
}: {
  notifications: Notification[];
  unread: number;
  category: "personal" | "system";
  emptyLabel: string;
}) {
  const t = useT("notifications");
  const format = useFormat();
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);

  // 🚨 失敗は**起きて終わったこと**なのでトースト（司令塔 2026-08-15 の切り分け）。
  //    以前ここにあった画面内の赤い帯は消した。
  const setRead = useSubmitOnce(
    async (id: string, read: boolean) => {
      const response = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ read }),
      });
      if (!response.ok) {
        toast.error(t("error_update_failed"));
        return;
      }
      router.refresh();
    },
    // 🚨 行ごとの鍵。省くと 1 件を既読にしている間、他の行が押せなくなる。
    (id) => id,
  );

  const markAll = useSubmitOnce(async () => {
    const response = await fetch(`/api/notifications?category=${category}`, {
      method: "POST",
    });
    if (!response.ok) {
      toast.error(t("error_update_failed"));
      return;
    }
    router.refresh();
  });

  const visible = unreadOnly ? notifications.filter((n) => !n.read_at) : notifications;

  return (
    <div className="space-y-4">
      {/* ページの主要アクション（`lib/admin/page-actions.ts` の /admin/notifications の定義）。
          🚨 未読が 0 のときは出さない。押しても何も起きないボタンを常設しない。 */}
      {unread > 0 ? (
        <PageAction
          label={t("mark_all_read")}
          icon={<CheckCheck />}
          onClick={() => void markAll.run()}
          pending={markAll.pending}
        />
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
        <ListEmpty>{emptyLabel}</ListEmpty>
      ) : (
        <ul className="divide-y">
          {visible.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                "flex items-start justify-between gap-4 py-3",
                notification.read_at && "text-muted-foreground",
              )}
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
                {/* 堀池さん:「『不具合に返信がありました』などから
                    **報告一覧のその報告チャットへ遷移**する」 */}
                {notification.link ? (
                  <Link
                    href={notification.link}
                    className="text-xs text-primary hover:text-primary/80 active:text-primary/80"
                  >
                    {t("open_link")}
                  </Link>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={notification.read_at ? t("mark_unread") : t("mark_read")}
                disabled={setRead.isPending(notification.id)}
                onClick={() => void setRead.run(notification.id, !notification.read_at)}
              >
                {notification.read_at ? <Undo2 /> : <Check />}
                <span className="hidden md:inline">
                  {notification.read_at ? t("mark_unread") : t("mark_read")}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
