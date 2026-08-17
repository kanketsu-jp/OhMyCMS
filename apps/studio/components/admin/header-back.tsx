"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
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
  /**
   * 🚨 **履歴の長さは「どこから来たか」を教えない**（files の実測・2026-08-17）。
   *
   * 直す前はここで `window.history.length > 2` を「アプリの中から来た」の目印にしていた。
   * files が反例を測って出した:
   * ```
   * 履歴の長さ **5** ／ 直前の入口は **アプリの外（about:blank）**
   *    → `router.back()` が走り、**アプリの外へ出た**
   * ＝ 「別のサイトを見たあと、URL を直接開いた人」は**いまも外へ出る**
   * ```
   * 🚨 長さは「何回動いたか」であって「**どこから来たか**」ではない。**別の問いだった。**
   *
   * → **自分で数える。** この文書が読み込まれてから、**アプリの中で経路が変わった回数**を持つ。
   *   1 回でも変わっていれば「中を歩いてきた」ので `router.back()` が安全。
   *   0 回なら、戻ると**この文書より前＝アプリの外**へ出るので、階層の親へ行く。
   * 🚨 `document.referrer` は使わない。**クライアント側の遷移では変わらない**ので、
   *   外から来て中を歩いた人を「外から来た」と誤って読む。
   */
  const inAppMoves = useRef(0);
  const lastPath = useRef<string | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    // 🚨 state を持たない（効果の中の同期 setState は lint が拒む。`page-action.tsx` と同じ理由）。
    if (lastPath.current !== null && lastPath.current !== pathname) inAppMoves.current += 1;
    lastPath.current = pathname;
  }, [pathname]);
  // 🚨 サーバでは `history` が無いので、描くたびではなく**最初に押されたとき**に基準を採る。
  //    `useEffect` で採らないのは、効果の中の同期 setState を lint が拒むため（`page-action.tsx` と同じ理由）。
  const crumbs = usePageTrail("");
  /**
   * 🚨 **転送するだけの区画は、行き先にしない**（司令塔の決定・2026-08-17・案 A）。
   *
   * 【測った】`/admin/content/zz_probe_actions` を新しいタブで直接開いて「もどる」を押すと、
   * **`/admin/content/acc_748015_pl`（別のコレクション）** に着いた（schema の実測）。
   * 私の側でも `/admin/content/<c>` で **URL が変わらない**ように見えていた
   * （たまたま最初のコレクションを開いていたので、変化が見えなかっただけ）。
   * ＝ 利用者からは「**見ていたコレクションが別のものに変わった**」と読める。
   *
   * 原因: `/admin/content` は**それ自体のページを持たず、最初のコレクションへ転送する**（K3）。
   * ＝ §5-4 の「押せない区画を行き先にしない」と**同じ性質**なので、同じ扱いにする。
   *
   * 🚨 **転送そのものは直さない**（Directus と同じ形で、K3 で入れた意味が消えるため）。
   *   **着地だけ**を変える。区画を跨いで `/admin/collections` 側へ出るのは、司令塔が認めた判断。
   *
   * 🚨 **ここに並ぶのは「転送するだけの区画」だけ**。ページを持つ区画（`/admin/files` など）を
   *   足さないこと——足すと、一覧へ戻れずに根まで飛ぶ（実測で確かめた悪化の形）。
   */
  const REDIRECT_ONLY = ["/admin/content"];
  const parent = [...crumbs]
    .slice(0, -1)
    .reverse()
    .find((c) => c.navigable && !REDIRECT_ONLY.includes(c.href));

  const goBack = useCallback(() => {
    // 🚨 **この文書の中でアプリの経路が変わったか**だけを見る。履歴の長さは見ない（上の申し送り）。
    const cameFromInsideApp = inAppMoves.current > 0;
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
