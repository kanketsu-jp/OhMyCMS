import Link from "next/link";

import { MarkPageMissing } from "@/components/admin/mark-page-missing";
import { getT } from "@/i18n/server";

/**
 * 「その URL は無い」を伝える中身。**2 枚の `not-found.tsx` が共有する。**
 *
 * 🚨 **なぜ部品にしたか**（`DESIGN.md` §0-1・DRY）:
 * `not-found.tsx` は **2 枚要る**（`app/` と `app/(admin)/`）。
 * 同じ文言・同じ導線を 2 箇所に書くと、**直すとき片方が腐る**。
 *
 * 🚨 **なぜ 2 枚要るのか**（実測 2026-08-17・pages）:
 * `app/` の 1 枚だけだと、`(admin)` の中で `notFound()` を呼んだとき
 * **中身は出るが HTTP が 200 のまま**だった。
 * ```
 * /admin/reports/manage      … 200（本文は「このページはありません」）
 * /admin/reports/zz-not-an-id… 200
 * 🟢 対照 /admin/zz-does-not-exist（どのルートにも当たらない）… 404
 * ```
 * ＝ **画面は正しいのに、機械には「在る」と答えている。**
 *
 * 🚨 **`(admin)` に境界を置いても、status は 200 のままだった**（実測 2026-08-17・pages）。
 *    置く前も後も 200。**直っていない。**
 *    🟢 対照 どのルートにも当たらない `/admin/zz-does-not-exist` は 404 を返す
 *    （＝ この計器は 404 も出せる）。
 *    🚨 **原因は特定していない。** 「境界を置けば 404 になる」と読まないこと。
 *    schema も同じことを独立に測っている（2026-08-17: content / collections / files /
 *    settings/roles の「無い id」も**全部 200**）。
 *    ＝ **notFound() を呼べば 404 になる、を前提にしないこと。**
 *
 * `(admin)` に境界を置いた理由は status ではなく **出る場所**:
 *
 * 🚨 **ナビを出さない。** ここは「その URL が無い」を伝える画面で、
 * `/admin` の外からも来る（ログインしているかどうかも分からない）。
 * ナビを出すと「入れる場所」を装う。行き先は 1 つだけ置く。
 */
export async function NotFoundScreen() {
  const t = await getT("errors");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      {/* 🚨 右サイドバーへ「この画面は無い」を知らせるだけ。何も描かない。
          置かないと、**存在しないものの画面で、右パネルがその画面の機能を約束する**
          （実測 2026-08-17: /admin/reports/<無い id> で「返信を書けます」が出ていた）。
          理由と実測は lib/admin/page-missing.ts の冒頭。 */}
      <MarkPageMissing />
      <h2 className="text-lg font-medium">{t("page_not_found_title")}</h2>
      <p className="text-base text-muted-foreground">{t("page_not_found_body")}</p>
      <Link
        href="/admin"
        className="text-sm text-primary hover:text-primary/80 active:text-primary/80"
      >
        {t("page_not_found_home")}
      </Link>
    </div>
  );
}
