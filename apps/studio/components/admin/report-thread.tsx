"use client";

import { CheckCheck, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { SHORTCUTS } from "@/components/admin/shortcuts";
import { useShortcut } from "@/components/admin/use-shortcut";
import {
  Message,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useFormat, useT } from "@/i18n/client";
import { apiErrorKey } from "@/lib/admin/forms";
import type { BugReport, BugReportMessage } from "@/lib/reports/service";

type Props = {
  report: BugReport;
  messages: BugReportMessage[];
  /** 見ている人。**自分の発言かどうかの判定だけに使う** */
  viewerId: string | null;
  canManage: boolean;
};

/**
 * 1 件の報告のやりとり。
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「不具合報告は**チャット形式**にする。**初回はフォームっぽくしていい。**
 * >   それ以降は返信があったらお知らせに表示される。」
 *
 * → **1 通目は報告そのもの**（件名・内容・本来どうなるはずだったか・自動で付いた情報）。
 *   2 通目以降がチャットの行。DB でも複製していないので、ここで続けて描く。
 *
 * 🚨 **スクロールの追従を自分で書かない。** shadcn の `message-scroller` に任せる
 *   （新しい行が増えたときに下へ張り付く／上を読んでいるときは動かさない、が要るところ。
 *    ここは自作するとほぼ必ず間違える）。
 */
export function ReportThread({ report, messages, viewerId, canManage }: Props) {
  const t = useT("reports");
  // 🚨 API の生文言（error.message）を画面へ出さない。細工したリンクで任意の文章を
  //    アプリ公式のエラー枠に出せる「なりすまし」の経路になるため（司令塔 2026-08-15）。
  //    code だけを apiErrorKey() で辞書の鍵へ写し、errors 名前空間から文言を引く。
  const tError = useT("errors");
  const format = useFormat();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const replyFormRef = useRef<HTMLFormElement>(null);

  const send = useSubmitOnce(async () => {
    const text = draft.trim();
    if (!text) return;

    const response = await fetch(`/api/reports/${report.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (!response.ok) {
      toast.error(tError(await apiErrorKey(response)));
      return;
    }
    setDraft("");
    // 送った結果を**サーバから読み直す**（画面の中だけで足すと、
    // 相手の発言が挟まったときに順番が食い違う）。
    router.refresh();
  });

  useShortcut(
    SHORTCUTS.submit,
    () => {
      // useShortcut は document に付くので、同じ組み合わせを持つ部品が
      // 2つ載っていると両方動く。いま入力している欄のフォームだけ送る。
      if (!replyFormRef.current?.contains(document.activeElement)) return;
      void send.run();
    },
    { whileTyping: true },
  );

  const changeStatus = useSubmitOnce(async (next: "open" | "resolved") => {
    const response = await fetch(`/api/reports/${report.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!response.ok) {
      toast.error(tError(await apiErrorKey(response)));
      return;
    }
    toast.success(next === "resolved" ? t("marked_resolved") : t("marked_reopened"));
    router.refresh();
  });

  const isResolved = report.status === "resolved";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-96 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {/* ── 1 通目 ＝ 報告そのもの ── */}
              <MessageScrollerItem>
                <Message align="end">
                  <MessageHeader>
                    <span className="text-xs text-muted-foreground">
                      {format.dateTime(report.created_at)}
                    </span>
                  </MessageHeader>
                  <MessageContent>
                    <p className="text-sm font-medium">{report.title}</p>
                    <p className="whitespace-pre-wrap text-sm">{report.body}</p>
                    {report.expected ? (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        <span className="font-medium">{t("report_expected_label")}: </span>
                        {report.expected}
                      </p>
                    ) : null}
                    {/* 自動で付いた情報（5W1H の Where）。**報告を読む側が再現するのに要る**。 */}
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted-foreground">
                      {report.page_path ? (
                        <>
                          <dt>{t("meta_page")}</dt>
                          <dd className="truncate font-mono">{report.page_path}</dd>
                        </>
                      ) : null}
                      {report.viewport ? (
                        <>
                          <dt>{t("meta_viewport")}</dt>
                          <dd className="font-mono">{report.viewport}</dd>
                        </>
                      ) : null}
                      {report.locale ? (
                        <>
                          <dt>{t("meta_locale")}</dt>
                          <dd className="font-mono">{report.locale}</dd>
                        </>
                      ) : null}
                      {report.app_version ? (
                        <>
                          <dt>{t("meta_version")}</dt>
                          <dd className="truncate font-mono">{report.app_version}</dd>
                        </>
                      ) : null}
                    </dl>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>

              {/* ── 2 通目以降 ── */}
              {messages.map((message) => {
                // 🚨 状態が変わった記録は**吹き出しにしない**。発言ではないので、
                //    真ん中に細く出して流れの中の目印にする。
                if (message.kind !== "message") {
                  return (
                    <MessageScrollerItem key={message.id}>
                      <p className="text-center text-xs text-muted-foreground">
                        {message.kind === "resolved" ? t("event_resolved") : t("event_reopened")}
                        {" · "}
                        {format.dateTime(message.created_at)}
                      </p>
                    </MessageScrollerItem>
                  );
                }

                // 🚨 名前やメールを出さない。**自分か相手か**だけが分かればよい
                //    （堀池さん「メアド＝今だれがログインしているか？は必要ない」と同じ考え方）。
                const mine = viewerId !== null && message.author === viewerId;
                return (
                  <MessageScrollerItem key={message.id}>
                    <Message align={mine ? "end" : "start"}>
                      <MessageHeader>
                        <span className="text-xs text-muted-foreground">
                          {mine ? t("author_you") : t("author_staff")}
                          {" · "}
                          {format.dateTime(message.created_at)}
                        </span>
                      </MessageHeader>
                      <MessageContent>
                        <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                );
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>

      {/* ── 返信を書くところ ── */}
      <form
        ref={replyFormRef}
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send.run();
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={20000}
          placeholder={t("reply_placeholder")}
          aria-label={t("reply_placeholder")}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* 🚨 解決にできるのは**管理できる人だけ**。
              直ったかどうかを決めるのは受け取った側なので、報告者には出さない。 */}
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              loading={changeStatus.pending}
              onClick={() => void changeStatus.run(isResolved ? "open" : "resolved")}
            >
              {isResolved ? <RotateCcw /> : <CheckCheck />}
              {isResolved ? t("reopen_button") : t("resolve_button")}
            </Button>
          ) : null}
          <Button type="submit" loading={send.pending} disabled={draft.trim() === ""}>
            <Send />
            {t("reply_button")}
          </Button>
        </div>
      </form>
    </div>
  );
}
