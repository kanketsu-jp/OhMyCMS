"use client";

import { MessageSquarePlus } from "lucide-react";

import { BugReportComposer } from "@/components/admin/bug-report-composer";
import { useRightPanel } from "@/components/admin/right-panel";

type Props = {
  /** 行に出す文字。辞書は呼ぶ側（layout.tsx）が引く */
  label: string;
};

/**
 * 左サイドバーの「報告する」。**リンクではない。**
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「不具合報告は左サイドバーにあって、アコーディオンにして『報告する』『報告一覧』があり、
 * >   **前者はすぐに報告できるようにします。これはモーダルにするという意味です。
 * >   どんな画面でも開ける。ただしそれは SP の話で、PC の場合は右サイドバーに表示させます。**」
 *
 * 🚨 **SP と PC の出し分けはここでは書かない。** `useRightPanel().push()` が
 *    PC なら右サイドバーへ積み、SP なら画面いっぱいのモーダルとして出す
 *    （shell の `right-panel.tsx` が引き受ける）。ここで分岐を書くと、
 *    同じ判断が 2 箇所に生まれる。
 *
 * 🚨 **戻るボタンも描かない。** 積んだぶんの「戻る」は右サイドバー側が出す
 *    （堀池さん「報告した後は戻るボタンで一つ前の表示に戻る」）。
 *
 * 🚨 送り終わったら `pop()` で 1 つ前へ戻す。**閉じない**——
 *    右サイドバーは元々そのページの説明を出していた面なので、
 *    報告のために横入りしたぶんだけ戻すのが元の状態。
 */
export function BugReportTrigger({ label }: Props) {
  const panel = useRightPanel();

  return (
    <button
      type="button"
      onClick={() =>
        panel.push({
          key: "bug-report",
          titleKey: "reports.create_title",
          node: <BugReportComposer onDone={() => panel.pop()} />,
        })
      }
      className="flex h-(--control-h) items-center gap-2 truncate rounded-md px-3 text-sm text-muted-foreground md:h-(--control-h-pc)"
    >
      <MessageSquarePlus className="size-4 shrink-0" />
      {label}
    </button>
  );
}
