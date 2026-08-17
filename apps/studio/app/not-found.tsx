import Link from "next/link";

import { getT } from "@/i18n/server";

/**
 * 見つからなかった URL の受け皿（アプリ全体）。
 *
 * 由来: 2026-08-17。司令塔が主要 12 画面を横断で測ったときに見つけた。
 * > 「存在しないルートの本文 … 『404 This page could not be found.』
 * >   ＝ Next の既定の 404 です。辞書を通っていません」
 *
 * 🚨 **既定の 404 も画面に出る文言**なので `AGENTS.md §3.8`（英語のリテラルも禁止）が効く。
 * 【引いた・2026-08-17】`app/**` に `not-found` のファイルは **0 件**だった
 * （🟢 対照 `loading.tsx` は 32 件 ＝ この探し方は 0 以外も出せる）。
 * ＝ **一度も作られていなかった**ので、Next の既定がそのまま出ていた。
 *
 * 🚨 **`app/` の直下に置く**。`app/(admin)/` に置くと、その区画の中で見つからなかったときだけ
 *    使われ、`/zz` のような区画の外は既定に落ちる。**全体の受け皿はここ 1 枚。**
 *
 * 🚨 **ヘッダも左サイドバーも出さない。** ここは「その URL が無い」を伝える画面で、
 *    ログインしているかどうかも分からない（`/admin` の外からも来る）。
 *    ナビを出すと「入れる場所」を装ってしまう。行き先は 1 つだけ置く。
 *
 * 🚨 **`errors` 名前空間を使う。** 新しい名前空間を作っていない
 *    （`not_found` が既にここに在り、同じ性格の文言なので隣に足した）。
 */
export default async function NotFound() {
  const t = await getT("errors");

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-medium">{t("page_not_found_title")}</h1>
      <p className="text-sm text-muted-foreground">{t("page_not_found_body")}</p>
      <Link
        href="/admin"
        className="text-sm text-primary hover:text-primary/80 active:text-primary/80"
      >
        {t("page_not_found_home")}
      </Link>
    </main>
  );
}
