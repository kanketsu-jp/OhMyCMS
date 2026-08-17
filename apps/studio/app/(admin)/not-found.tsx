import { NotFoundScreen } from "@/components/admin/not-found-screen";

/**
 * 管理画面の中で `notFound()` が呼ばれたときの受け皿。
 *
 * 🚨 **なぜ `app/not-found.tsx` だけでは足りないか**（実測 2026-08-17・pages）:
 * ```
 * 置く前 /admin/reports/manage       … HTTP **200**（本文は「このページはありません」）
 *        /admin/reports/zz-not-an-id … HTTP **200**
 *        🟢 対照 /admin/zz-does-not-exist … 404（どのルートにも当たらないので根の 1 枚が受ける）
 * ```
 * ＝ **画面は正しいのに、機械には「在る」と答えていた。**
 *
 * 🚨 **ここはヘッダと左サイドバーの中に出る**（`(admin)` の layout が生きている）。
 *    それでよい——管理画面の中で迷った人は、**そのまま他の場所へ移れる**のが正しい。
 *    区画の外（`/zz`）は根の 1 枚が受け、そちらはナビを出さない。
 *
 * 🚨 **中身は持たない**（`DESIGN.md` §0-1）。文言と導線は `NotFoundScreen` が 1 つだけ持つ。
 */
export default function AdminNotFound() {
  return <NotFoundScreen />;
}
