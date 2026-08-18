"use client";

import { InfoIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRightPanel } from "@/components/admin/right-panel";
import { useT } from "@/i18n/client";

export function InfoHint({ sectionId }: { sectionId: string }) {
  const t = useT("panel");
  const { focusSection } = useRightPanel();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      aria-label={t("show_hint")}
      onClick={() => focusSection(sectionId)}
    >
      <InfoIcon />
    </Button>
  );
}
