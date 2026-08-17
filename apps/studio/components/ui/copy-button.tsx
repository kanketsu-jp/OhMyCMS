"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

type CopyState = "idle" | "copied" | "failed";

type CopyButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "onClick" | "type" | "variant"
> & {
  value: string;
  selectTargetId?: string;
  /**
   * **何をコピーするか**（例: `"id"` / `"ACS URL"`）。渡すとラベルが「<何> をコピー」になる。
   *
   * 🚨 規約 DESIGN.md §2-12（堀池・2026-08-17。原文:「これはボタン自体が「IDをコピー」と
   *    表示するべき。」）。「コピー」だけでは**何をコピーするか分からない**——
   *    隣にラベルが在っても、**ボタンだけを見た人には伝わらない**。
   *
   * 🚨 **省略できる形にしてあるのは、既存の呼び出しの見え方を変えないため**
   *    （実測 2026-08-17: この部品は **9 箇所 / 6 ファイル**から呼ばれていて、
   *    5 ファイルは他レーンの持ち場。渡すのは各レーンの仕事）。
   *    ＝ 省略時はいままでどおり「コピー」。
   */
  what?: string;
};

function selectFallbackTarget(targetId?: string): boolean {
  if (!targetId) return false;

  const target = document.getElementById(targetId);
  if (!target) return false;

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    target.focus({ preventScroll: true });
    target.select();
    return true;
  }

  const selection = window.getSelection();
  if (!selection) return false;

  const range = document.createRange();
  range.selectNodeContents(target);
  selection.removeAllRanges();
  selection.addRange(range);
  if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  return true;
}

export function CopyButton({
  value,
  selectTargetId,
  what,
  size = "sm",
  disabled,
  ...props
}: CopyButtonProps) {
  const t = useT("common");
  const [state, setState] = React.useState<CopyState>("idle");
  const resetTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const scheduleReset = React.useCallback(() => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setState("idle"), 3000);
  }, []);

  const copy = React.useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      selectFallbackTarget(selectTargetId);
      setState("failed");
    } finally {
      scheduleReset();
    }
  }, [scheduleReset, selectTargetId, value]);

  const label =
    state === "copied"
      ? t("copy_button_copied")
      : state === "failed"
        ? t("copy_button_failed")
        : // 🚨 押す前だけ「何を」を言う。押した後（コピー済み／失敗）は**結果**なので短いままにする。
          what
          ? t("copy_button_what", { what })
          : t("copy_button");
  const Icon = state === "copied" ? Check : Copy;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {/* コピー直後は視線がボタン上にあるため、トーストではなく同じ場所で状態を返す。 */}
      <Button
        {...props}
        data-slot="copy-button"
        type="button"
        variant="outline"
        size={size}
        disabled={disabled}
        onClick={() => void copy()}
      >
        <Icon data-icon="inline-start" />
        <span aria-live="polite">{label}</span>
      </Button>
      {state === "failed" ? (
        <span role="status" className="text-xs leading-5 text-destructive">
          {t("copy_button_failed_selected")}
        </span>
      ) : null}
    </span>
  );
}
