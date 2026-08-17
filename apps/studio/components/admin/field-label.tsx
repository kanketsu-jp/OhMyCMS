"use client";

import type { ComponentProps } from "react";

import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";

/**
 * 欄の題。必須なら、押す前に分かる印を出す。
 *
 * components/ui/label.tsx は shadcn の生成物・全画面に及ぶので触らない。
 * 記号だけだと読み上げで飛ばされることが在るため、読み上げ用の文言も添える。
 */
export function FieldLabel({
  required = false,
  children,
  ...props
}: ComponentProps<typeof Label> & { required?: boolean }) {
  const t = useT("common");

  return (
    <Label {...props}>
      {children}
      {required ? (
        <>
          <span aria-hidden className="text-primary">*</span>
          <span className="sr-only">{t("required")}</span>
        </>
      ) : null}
    </Label>
  );
}
