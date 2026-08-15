"use client";

import Link from "next/link";

import { BugReportTrigger } from "@/components/admin/bug-report-trigger";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Props = {
  /** 「報告する」の行に出す文字（押すとモーダル/右サイドバー） */
  labelReport: string;
  /** 「報告一覧」の行に出す文字 */
  labelList: string;
  /** 「報告管理」の行に出す文字。`canManage` が偽なら描かない */
  labelManage: string;
  /** アコーディオンの見出し（＝いまの `t("reports")`） */
  groupLabel: string;
  /** 管理権限があるか。無ければ「報告管理」を出さない */
  canManage: boolean;
};

// ②③の見た目は、以前の `layout.tsx` の `reportsNav`（素のリンク）とそろえる。
const linkClassName =
  "flex h-(--control-h) items-center truncate rounded-md px-3 text-sm text-muted-foreground md:h-(--control-h-pc)";

/**
 * 左サイドバー下部の「不具合報告」。**素のリンク1本ではなくアコーディオン**にする。
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「不具合報告は左サイドバーにあって、アコーディオンにして『報告する』『報告一覧』があり、
 * >   前者はすぐに報告できるようにします。これはモーダルにするという意味です。
 * >   どんな画面でも開ける。ただしそれは SP の話で、PC の場合は右サイドバーに表示させます。」
 * 管理権限がある人にはさらに「報告管理」を出す。
 *
 * 🚨 **辞書はここで引かない。** 文言は `layout.tsx`（サーバ側）が `t()` で引いて渡す
 *    （いまの `reportsNav` と同じ流儀。`bug-report-trigger.tsx` の `label` prop も同じ）。
 *
 * 🚨 **既定は閉じておく**（`defaultValue` を渡さない）。開いた状態を既定にすると、
 *    毎回サイドバーの下が伸びる。
 */
export function BugReportNav({ labelReport, labelList, labelManage, groupLabel, canManage }: Props) {
  return (
    <Accordion>
      <AccordionItem value="reports">
        <AccordionTrigger
          className="flex h-(--control-h) items-center rounded-md px-3 py-0 text-sm text-muted-foreground md:h-(--control-h-pc)"
          onClick={(event) => {
            // 🚨 **SP のドロワーが、アコーディオンを開いた瞬間に閉じてしまう問題への対処。**
            // `mobile-nav.tsx:200` は `<div onClick={() => setOpen(false)}>{reports}</div>` で
            // この部品（＝ここ全体）をまとめて包んでおり、**中のどこを押してもドロワーが閉じる**。
            // 中身が Link 1本だった頃はそれで正しかったが、アコーディオンにすると
            // 見出しを押して開こうとした瞬間にドロワーごと閉じ、②③（一覧・管理）へ
            // 永遠に辿り着けなくなる。だから**見出し（Trigger）の click だけ**バブルを止める。
            // ①②③（葉）はそのままバブルさせる——押したらドロワーが閉じるのが正しい
            // （①は画面いっぱいのモーダルが開くので、後ろのドロワーは閉じているべき）。
            // 🚨 `stopPropagation` はアコーディオン自身の開閉（Radix 内部の
            // `composeEventHandlers` は `defaultPrevented` だけを見るので、ここで
            // `preventDefault` はしない限り開閉は普通に動く）を止めない。止めるのは
            // 外側（mobile-nav.tsx）への伝播だけ。
            event.stopPropagation();
          }}
        >
          {groupLabel}
        </AccordionTrigger>
        <AccordionContent className="pb-0">
          <div className="flex flex-col">
            <BugReportTrigger label={labelReport} />
            <Link href="/admin/reports" className={linkClassName}>
              {labelList}
            </Link>
            {canManage ? (
              <Link href="/admin/reports/manage" className={linkClassName}>
                {labelManage}
              </Link>
            ) : null}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
