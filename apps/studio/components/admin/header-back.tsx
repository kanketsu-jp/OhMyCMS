"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePageTrail } from "@/components/admin/page-trail";
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

  /**
   * 🚨 **アプリの外へ出さない**（2026-08-17・「初めて触る人の目」で見つけた）。
   *
   * 【測った】共有台で **新しいタブから `/admin/version` を直接開く**（ブックマーク・リンク・再読み込み）:
   * ```
   * history.length …… **2**（about:blank → その画面）
   * 「もどる」を押す … URL が **about:blank** ＝ **真っ白な画面へ出る。戻る道も無い**
   * 🟢 対照 パンくずの中には `/admin` への本物のリンクが在った
   *    ＝ **上へ行く道は在るのに、目立つボタンの方が外へ出していた**
   * ```
   * ＝ `router.back()` は**ブラウザの履歴**をたどるもので、**画面の階層**ではない。
   *   アプリの中を歩いてきた人には正しいが、**直接来た人には正しくない**。
   *
   * 🚨 直し方: **この画面より前にアプリの中で動いたか**を見て、
   *   動いていなければ **上の階層へ**行く（`page-trail` が持っている道筋の、押せる最後の親）。
   *   🚨 **押せない区画（`navigable: false`）は行き先にしない**——`/admin/settings` は
   *     ページが無く、行くと 404 になる（`page-trail.ts` の申し送り）。
   */
  const entryLength = useRef<number | null>(null);
  // 🚨 サーバでは `history` が無いので、描くたびではなく**最初に押されたとき**に基準を採る。
  //    `useEffect` で採らないのは、効果の中の同期 setState を lint が拒むため（`page-action.tsx` と同じ理由）。
  const crumbs = usePageTrail("");
  const parent = [...crumbs].slice(0, -1).reverse().find((c) => c.navigable);

  const goBack = useCallback(() => {
    if (entryLength.current === null) entryLength.current = window.history.length;
    // 🚨 **この画面へ来る前にアプリの中で動いていれば**、履歴を戻すのが正しい。
    //    そうでなければ、戻ると**アプリの外**（about:blank や別のサイト）へ出る。
    const cameFromInsideApp = window.history.length > 2;
    if (cameFromInsideApp) {
      router.back();
      return;
    }
    router.push(parent?.href ?? "/admin");
  }, [router, parent]);
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
