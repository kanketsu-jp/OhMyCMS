"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useT } from "@/i18n/client";

/**
 * 右サイドバーの「概要」に出す、いまの保管先（D5）。
 *
 * 堀池さん（2026-08-17 D5 原文）:
 * > 「概要：右サイドバーに「概要」アコーディオンを追加し、デフォルトで開くようにしてください。
 * >   ここに現在のストレージ情報を表示し、「ストレージを設定」ボタンから
 * >   admin/settings/storage へ遷移できるようにしてください」
 *
 * 🚨 **出すのは `/admin/files` だけ**（司令塔の決定）。右サイドバーは全ページ共通だが、
 *    概要の中身は経路ごとに `page-meta` が持つ作りで、全ページ共通の欄が無い。
 *    そしてストレージは設定の話なので、コレクションの編集画面に出しても押す理由が無い。
 *
 * 🚨 **鍵は出さない。** 読むのは `/api/settings/storage-status` で、返るのは
 *    保管先の種類・バケット名・ホスト名・落ちているかどうか・足りない環境変数の**名前**だけ。
 *    アクセスキーは伏せ字でも返らない（`lib/storage/index.ts` の型が守り手）。
 *
 * 🚨 **権限が無ければ何も出さない。** 口が 403 を返すので、そのときは節ごと消える
 *    （「権限がありません」と書かない——出す物が無い状態と、壊れている状態を混ぜないため）。
 */
type StorageStatus = {
  driver: "local" | "s3";
  bucket: string | null;
  endpointHost: string | null;
  misconfigured: boolean;
  missing: string[];
};

export function PanelStorage() {
  const t = useT("panel");
  const pathname = usePathname();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [failed, setFailed] = useState(false);

  // 🚨 `/admin/files` 以外では読みに行かない（他のページの負荷を増やさない）。
  const enabled = pathname === "/admin/files";

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/settings/storage-status", { cache: "no-store" });
        if (!response.ok) {
          // 🚨 403（権限が無い）も 500 も、ここでは同じ「出せない」に落とす。
          //    画面に理由を書かない代わりに、節ごと出さない。
          if (alive) setFailed(true);
          return;
        }
        const payload = (await response.json()) as { data?: StorageStatus };
        if (alive && payload.data) setStatus(payload.data);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  if (!enabled || failed || status === null) return null;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="shrink-0 text-sm text-muted-foreground">{t("storage_driver")}</span>
        <span className="min-w-0 truncate text-right text-sm">
          {status.driver === "s3" ? t("storage_driver_s3") : t("storage_driver_local")}
        </span>
      </div>
      {status.bucket ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">{t("storage_bucket")}</span>
          <span className="min-w-0 truncate text-right text-sm">{status.bucket}</span>
        </div>
      ) : null}
      {status.endpointHost ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">{t("storage_endpoint")}</span>
          <span className="min-w-0 truncate text-right text-sm">{status.endpointHost}</span>
        </div>
      ) : null}
      {/*
        🚨 S3 を設定しかけて要件を満たさず、ローカルへ落ちている状態。
           「設定した気でいるのに保存先が違う」が起きるので、足りない環境変数の名前まで出す。
      */}
      {status.misconfigured ? (
        <p className="text-sm text-destructive">
          {t("storage_misconfigured", { names: status.missing.join(", ") })}
        </p>
      ) : null}
      {/*
        🚨 **罫線を付けない。** 付けたら門（check-surface-nesting）に止められた
        （2026-08-17 実測: 「面の中に、もう 1 枚面を描いています」1 件）。
        右サイドバーの節は既に面なので、その中に枠を作ると面が 2 段になる
        （`knowledge/decisions/no-nested-surfaces.md`）。
        押せることは、押したときの色（hover / active）で示す。
        🚨 `hover:` を書いたら必ず `active:` も書く（タッチには hover が無い）。
      */}
      <Link
        href="/admin/settings/storage"
        className="mt-1 flex min-h-(--control-h) items-center justify-center rounded-md px-2 text-sm underline-offset-2 hover:bg-muted hover:underline active:bg-muted active:underline md:min-h-(--control-h-pc)"
      >
        {t("storage_configure")}
      </Link>
    </div>
  );
}
