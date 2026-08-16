import { notFound } from "next/navigation";

import { ErrorBanner } from "@/components/admin/error-banner";
import { ReportThread } from "@/components/admin/report-thread";
import { getT } from "@/i18n/server";
import { apiFetch, currentUser } from "@/lib/admin/api";
import type { BugReport, BugReportMessage } from "@/lib/reports/service";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * 報告 1 件のチャット。
 *
 * 堀池さん（2026-08-15）:
 * > 「あくまでこれはお知らせ一覧なので、『不具合に返信がありました』や
 * >   『不具合が解決しました』などから**『報告一覧』のその報告チャットへ遷移**する。」
 * → お知らせの link がこの URL を指している。
 *
 * 🚨 **他人の報告は 404**。API がそう返す（403 にしない ＝ 在ることも教えない）ので、
 *    ここでもそのまま 404 にする。
 *
 * 🚨 **ただし 404 以外の失敗まで 404 にしない**（2026-08-16）。
 *    以前は `if (!result.ok) notFound()` で、**500 も 401 も通信不能も
 *    「見つかりません」**と表示していた ＝ **「取れなかった」を「無い」と言っていた**。
 *    利用者は在るものを無いと思って諦めるし、直す側は障害に気づけない。
 *    → **404 だけ 404**、それ以外は他の 23 画面と同じ `ErrorBanner`。
 */
export default async function ReportThreadPage({ params }: Props) {
  const { id } = await params;

  const result = await apiFetch<{
    report: BugReport;
    messages: BugReportMessage[];
    can_manage: boolean;
  }>(`/api/reports/${id}`);

  if (!result.ok) {
    // 🚨 404 は「本当に無い」と「他人のもの」の両方を含む（上の注記のとおり意図的）。
    if (result.status === 404) notFound();
    const tError = await getT("errors");
    return (
      <div className="flex max-w-3xl flex-col">
        <ErrorBanner message={tError(result.messageKey)} />
      </div>
    );
  }

  // 「自分の発言か」の判定だけに使う。名前もメールも画面には出さない。
  const me = await currentUser();
  const viewerId = me.ok && me.data.type === "human" ? me.data.userId : null;

  return (
    <div className="flex max-w-3xl flex-col">
      <ReportThread
        report={result.data.report}
        messages={result.data.messages}
        viewerId={viewerId}
        canManage={result.data.can_manage}
      />
    </div>
  );
}
