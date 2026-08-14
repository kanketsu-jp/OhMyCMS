"use client";

import { MessageSquarePlus } from "lucide-react";

import { BugReportComposer } from "@/components/admin/bug-report-composer";
import { PageAction } from "@/components/admin/page-action";
import { useRightPanel } from "@/components/admin/right-panel";

/**
 * 「報告する」を**ヘッダーの主要アクション**として出す
 * （`lib/admin/page-actions.ts` の `/admin/reports` の定義に対応する）。
 *
 * 🚨 `PageAction` の `href` ではなく `onClick`。行き先が別ページではなく、
 *    その場で右サイドバー（PC）／画面いっぱいのモーダル（SP）を開くため。
 *
 * 🚨 左サイドバーの「報告する」（`bug-report-trigger.tsx`）と**同じものを開く**。
 *    開き方が 2 通りあると、片方だけ直したときに食い違う。
 */
export function BugReportAction({ label }: { label: string }) {
  const panel = useRightPanel();

  return (
    <PageAction
      label={label}
      icon={<MessageSquarePlus />}
      onClick={() =>
        panel.push({
          key: "bug-report",
          titleKey: "reports.create_title",
          node: <BugReportComposer onDone={() => panel.pop()} />,
        })
      }
    />
  );
}
