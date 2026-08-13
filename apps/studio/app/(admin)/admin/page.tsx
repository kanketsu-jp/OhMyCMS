import { redirect } from "next/navigation";

/**
 * 管理画面のトップは**持たない**。`/admin/collections` へ送る。
 *
 * 堀池さん（原文・2026-08-14）:
 * 「**ホームは必要ない。代わりにホームはコレクションにする。**
 *   ルールとして、**ページではまずそれを見せる。**」
 *
 * 🚨 ここには「コレクション一覧を開く」ボタンが1つあるだけだった。
 * **1つのリンクのためだけのページ**で、開くたびにもう1回押させていた。
 *
 * 🚨 **同じ画面に URL を2つ持たせない。** 中身を `/admin/collections` と同じにするのではなく、
 * **転送**にしてある。正は `/admin/collections` の1つだけ。
 * （files と folders を2画面に割っていたのと同じ誤りを繰り返さないため）
 */
export default function AdminPage() {
  redirect("/admin/collections");
}
