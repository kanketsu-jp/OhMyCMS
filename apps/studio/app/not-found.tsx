import { NotFoundScreen } from "@/components/admin/not-found-screen";

/**
 * 見つからなかった URL の受け皿（**どのルートにも当たらなかったとき**）。
 *
 * 由来: 2026-08-17。司令塔が主要 12 画面を横断で測ったときに見つけた。
 * > 「存在しないルートの本文 … 『404 This page could not be found.』
 * >   ＝ Next の既定の 404 です。辞書を通っていません」
 *
 * 🚨 **既定の 404 も画面に出る文言**なので `AGENTS.md §3.8`（英語のリテラルも禁止）が効く。
 *
 * 🚨 **`app/` の直下に置く。** ここは `/zz` のような**区画の外**を受ける。
 *    `(admin)` の中で `notFound()` を呼んだときの受け皿は `app/(admin)/not-found.tsx`。
 *    **1 枚では足りない**（実測: 中身は出るが HTTP が 200 のままだった。
 *    詳細は `components/admin/not-found-screen.tsx` の説明）。
 *
 * 🚨 **中身は持たない。** 文言と導線は `NotFoundScreen` が 1 つだけ持つ（`DESIGN.md` §0-1）。
 *    ここが持つのは「画面いっぱいに中央寄せする」ことだけ——
 *    こちらはヘッダも左サイドバーも無いので、自分で高さを取る必要がある。
 */
export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <NotFoundScreen />
    </main>
  );
}
