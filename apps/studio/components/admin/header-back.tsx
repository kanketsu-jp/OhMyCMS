"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Undo2Icon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { SHORTCUTS, formatShortcut } from "@/components/admin/shortcuts";
import { useIsMac, useShortcut } from "@/components/admin/use-shortcut";
import { useT } from "@/i18n/client";

/**
 * ヘッダー左の「戻る」。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「戻るアイコンとPCのみショートカット（⌘Deleteか⌘←など）」
 *
 * 🚨 ショートカットの表示は **PC だけ**。SP にキーボードは無い。
 * 🚨 組み合わせは `shortcuts.ts` から読む（ここに書かない）。
 * 🚨 名前は辞書（`common.back`）、記号は `formatShortcut`（辞書ではなく実行環境で決まる）。
 */
export function HeaderBack() {
  const t = useT("common");
  const router = useRouter();
  const isMac = useIsMac();

  const goBack = useCallback(() => router.back(), [router]);
  useShortcut(SHORTCUTS.back, goBack);

  return (
    // 🚨 **ショートカットはバッジで出さない。ツールチップで見せる**
    //    （堀池・2026-08-17・Y1「ショートカットバッジは窮屈なので、すべて廃止。
    //      代わりにツールチップにする」）。
    //    🚨 これは **L1（30 分前）の「ショートカットキーも表示しながら」の反転**。
    //      堀池さんが実物を見て「窮屈」と判断されたもので、前の指示が誤りだったのではない。
    //      **消さずに経緯を残す**（次の人が「表示しろと書いてある」と戻さないように）。
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          onClick={goBack}
          className="min-w-0 text-muted-foreground"
        >
          <Undo2Icon aria-hidden="true" />
          <span className="truncate">{t("back")}</span>
        </Button>
      </TooltipTrigger>
      {/* 🚨 名前は既にボタンに見えているので、ツールチップは**鍵だけ**にする
          （同じ語を 2 回出さない）。記号は環境で変わるので辞書に入れない。 */}
      <TooltipContent side="bottom">{formatShortcut(SHORTCUTS.back, isMac)}</TooltipContent>
    </Tooltip>
  );
}
