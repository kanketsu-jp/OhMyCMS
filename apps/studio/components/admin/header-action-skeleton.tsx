"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { pageActions } from "@/lib/admin/page-actions";

/**
 * 主操作が**まだ出ていない**あいだ、その場所に骨組みを出す。
 *
 * 由来: 2026-08-17、私が「初めて触る人の目」の 6 周目（**遅いとき**）で見つけた分。
 * 司令塔の決定（案 B）。
 *
 * ## 🚨 何が問題だったか（実測）
 * ```
 * 遅い回線（3G 相当・latency 400ms / 400kbps）:
 *   header が出るまで ……… **0ms**（パンくず・もどる・info は最初から在る）
 *   🚨 **主操作が出るまで** … /admin/collections **7720ms** ／ /admin/files **2418ms**
 * 🟢 対照 速い回線 … **0ms / 1ms**
 * ```
 * ＝ 最大 7.7 秒、**「主操作が無いヘッダー」が完成品の顔で出ていた**。
 * 🚨 利用者から見ると「**この画面には操作が無い**」（ゴミ箱・通知は本当に無い）と
 * 「**まだ出ていない**」が**同じ見た目**になる。**待てばよいのか、無いのかが分からない。**
 *
 * ## 🚨 なぜ「枠を確保する」ではないのか
 *
 * 枠を常に確保すると、**主操作が無い画面（ゴミ箱・通知）で空の帯が残る**——
 * `DESIGN.md` §1-4「中身が 0 件のとき、器と線を残さない」とぶつかる。
 * **持つ画面にだけ出す**ので、持たない画面には何も出ない。
 *
 * ## 🚨 「持つかどうか」を新しく作らない
 *
 * `lib/admin/page-actions.ts` が**ルートごとに宣言を持っている**ので、それを引く（`DESIGN.md` §0-1）。
 * 骨組みの見た目も `components/ui/skeleton.tsx` の素をそのまま使う。**新しい部品を作っていない。**
 *
 * 🚨 **実物が出たら消える。** 出たかどうかは `#header-primary-action` の中身で見る——
 * 「出るはずの時間」で消すと、**遅い回線で骨組みが先に消えて元の問題に戻る**。
 *
 * ## 🚨 宣言は「必ず出る」を意味しない（**私が入れた不具合の跡**）
 *
 * 最初、宣言（`page-actions.ts`）だけを見て骨組みを出したら、
 * **`/admin/notifications` で骨組みが消えなくなった**（実測: 骨組み 1 / 主操作 0 が 2.5 秒後も残る）。
 * 原因は、その画面が **`unread > 0` のときだけ**主操作を描くこと
 * （`notifications-manager.tsx`:「押しても何も起きないボタンを常設しない」）。
 * ＝ 🚨 **宣言は「持ちうる」であって「必ず出る」ではない。**
 *
 * → **読み込みが終わっても実物が来なければ、骨組みを消す。**
 * 🚨 **秒数で消さない**（`setTimeout(3000)` のような数）。遅い回線では**まだ来る途中**で消えてしまい、
 * 直したはずの問題に戻る。**`document.readyState === "complete"` を待つ**——
 * これは「この文書の読み込みが終わった」という**観測できた事実**で、環境によって伸び縮みする。
 */
export function HeaderActionSkeleton() {
  const pathname = usePathname();
  const filled = useSlotFilled("header-primary-action");

  // 🚨 **宣言の上で主操作を持たない画面には、何も出さない**（§1-4）。
  //    `inMenu` の項目は ▾ の中なので、主ボタンの有無には数えない。
  const loaded = useDocumentLoaded();
  const hasAction = pageActions(pathname).some((a) => !a.inMenu);
  // 🚨 読み込みが終わってもまだ空なら、**その画面は出さないと決めた**ということ（上の申し送り）。
  if (!hasAction || filled || loaded) return null;

  // 🚨 大きさは実物に寄せる（`page-action.tsx` の PC の主ボタンは `md:min-w-40` ＝ 160px）。
  //    ずれると、出た瞬間に**周りが動く**。
  return <Skeleton aria-hidden className="my-3 h-8 w-40" />;
}

/**
 * その枠に**実物が入っているか**。
 *
 * 🚨 `useSyncExternalStore` で購読する。`PageAction` は portal で後から入るので、
 * **1 回読むだけでは「まだ空」のまま固まる**。
 */
function useSlotFilled(id: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const target = document.getElementById(id);
      if (!target) return () => {};
      const observer = new MutationObserver(onChange);
      observer.observe(target, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
    () => (document.getElementById(id)?.childElementCount ?? 0) > 0,
    () => false,
  );
}

/**
 * この文書の読み込みが終わったか。
 *
 * 🚨 **秒数を決め打ちしない。** 遅い回線では読み込みが長く、速い回線では一瞬——
 * `readyState` は**その環境で実際に終わった時点**を教える。
 */
function useDocumentLoaded(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (document.readyState === "complete") return () => {};
      window.addEventListener("load", onChange);
      return () => window.removeEventListener("load", onChange);
    },
    () => document.readyState === "complete",
    () => false,
  );
}
