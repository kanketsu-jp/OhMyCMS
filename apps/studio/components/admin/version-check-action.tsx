"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { PageAction } from "@/components/admin/page-action";
import { useT } from "@/i18n/client";

/**
 * バージョン確認ページのアクションボタン（もう一度確認しに行く）。
 *
 * ページは Server Component なので、`PageAction`（client）を直接は置けない。
 * この小さな client 部品を挟む。
 *
 * 🚨 **これは「再読み込み」ではなく本当に確認しに行く。**
 *    `router.refresh()` → RSC が `/api/version` を引き直す → `checkForUpdate()` が走る。
 *    経路の両端が `cache: "no-store"`（`lib/admin/api.ts` / `lib/version/service.ts`）
 *    なので、古い結果を見せて「最新です」と言うことにはならない。**実測して確認済み**。
 *
 * 🚨 **確認先が未設定のときは、このボタンを出さない**（呼び出し側が出し分ける）。
 *    未設定なら `checkForUpdate()` は fetch へ到達せずに返る仕様なので、
 *    押しても何も起きないボタンになる。**「押せるのに何も起きない」を作らない。**
 *
 * 結果は画面の状態（最新です／更新があります）なのでトーストにしない
 * （司令塔 2026-08-15「出来事はトースト、状態はページ」）。
 */
export function VersionCheckAction() {
  const t = useT("version");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <PageAction
      onClick={() => startTransition(() => router.refresh())}
      pending={pending}
      label={t("check_button")}
      icon={<RefreshCw />}
      role="primary"
    />
  );
}
