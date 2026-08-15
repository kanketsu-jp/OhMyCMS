"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Undo2Icon } from "lucide-react";

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
 * 🚨 名前は辞書（`common.back`）、記号は `formatShortcut`（辞書ではなく実行環境で決まる）。
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
      onClick={goBack}
      className="min-w-0 text-muted-foreground"
    >
      <Undo2Icon aria-hidden="true" />
      <span className="truncate">{t("back")}</span>
      <Kbd className="hidden md:inline-flex">{formatShortcut(SHORTCUTS.back, isMac)}</Kbd>
    </Button>
  );
}
