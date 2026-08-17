import { redirect } from "next/navigation";

/**
 * 🚨 **この画面は畳んだ**（2026-08-17・`decisions/list-views-are-switchable-layouts` §8）。
 *
 * 「全員の報告」は**別の画面ではなく、同じ一覧の範囲違い**だった。
 * 実際、`/admin/reports` との差は **`scope=all` の 1 つだけ**で、
 * 一覧の描き方は 2 箇所に写されていた（＝ **片方だけ直る事故が起きる形**）。
 *
 * 🚨 **消さずに転送にする理由**: この URL は**既に誰かのブックマークや履歴に在る**。
 *    消すと 404 になり、「機能が無くなった」と読まれる。
 *    （`decisions/folders-live-inside-files` と同じ扱い——**畳むときは転送を残す**）
 *
 * 🚨 **`status` を保ったまま送る。** 解決済みを見ていた人が、未解決へ飛ばされない。
 */
type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function ReportsManageRedirect({ searchParams }: Props) {
  const params = await searchParams;
  const status = params.status === "resolved" ? "resolved" : "open";
  redirect(`/admin/reports?status=${status}&scope=all`);
}
