"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
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
 * 🚨 名前は辞書（`common.shortcut_back`）、記号は `formatShortcut`（辞書ではなく実行環境で決まる）。
 */
export function HeaderBack() {
  const t = useT("common");
  const router = useRouter();
  const isMac = useIsMac();

  const goBack = useCallback(() => router.back(), [router]);
  useShortcut(SHORTCUTS.back, goBack);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={goBack}
      aria-label={t("shortcut_back")}
      className="text-muted-foreground"
    >
      <ArrowLeftIcon />
      <Kbd className="hidden md:inline-flex">{formatShortcut(SHORTCUTS.back, isMac)}</Kbd>
    </Button>
  );
}
