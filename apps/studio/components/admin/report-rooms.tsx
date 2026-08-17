import Link from "next/link";

import { ListEmpty } from "@/components/admin/list-empty";
import type { BugReport } from "@/lib/reports/service";
import { cn } from "@/lib/utils";

type Props = {
  reports: BugReport[];
  /** 「まだ 1 件も無い」ときに出す文 */
  emptyLabel: string;
  /** 解決済みの印に使う文 */
  resolvedLabel: string;
  /** 日時の整形。呼ぶ側（サーバ側）が `getFormat()` から渡す */
  formatDateTime: (value: string) => string;
};

/**
 * チャットルームの並び。**「報告一覧」と「報告管理」で同じものを使う**。
 *
 * 堀池さん（2026-08-15）:
 * > 「**報告一覧では未解決のチャットルームが並ぶ**。…
 * >   管理者の『報告管理』ページには**全てのチャット**が表示。」
 *
 * → 違うのは**何を渡すか**（自分の分か全部か）だけなので、見た目は 1 つにする。
 *   2 つ書くと、片方だけ直して食い違う。
 *
 * 🚨 **枠で囲まない**（堀池さん「ボーダー＋Padding はいらない…カードコンポーネントを
 *    多用するのはデザインスキルが低い」）。行の区切りは罫線 1 本だけにする。
 */
export function ReportRooms({ reports, emptyLabel, resolvedLabel, formatDateTime }: Props) {
  if (reports.length === 0) {
    return <ListEmpty>{emptyLabel}</ListEmpty>;
  }

  return (
    <ul className="divide-y">
      {reports.map((report) => (
        <li key={report.id}>
          <Link
            href={`/admin/reports/${report.id}`}
            className="flex min-w-0 items-baseline gap-3 py-3 hover:bg-muted/50 active:bg-muted/50"
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                // 解決済みは**弱める**。並んでいる中で「まだ見るべきもの」を先に目に入れる。
                report.status === "resolved" ? "text-muted-foreground" : "font-medium",
              )}
            >
              {report.title}
            </span>
            {report.status === "resolved" ? (
              <span className="shrink-0 text-xs text-muted-foreground">{resolvedLabel}</span>
            ) : null}
            {/* 🚨 並び順と同じ値を出す（返信が来た時刻。無ければ報告された時刻）。
                一覧の並びと表示が違うと「なぜこの順なのか」が分からなくなる。 */}
            <time
              dateTime={report.last_message_at ?? report.created_at}
              className="shrink-0 text-xs text-muted-foreground"
            >
              {formatDateTime(report.last_message_at ?? report.created_at)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
