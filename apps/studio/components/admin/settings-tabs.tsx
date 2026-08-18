"use client";

import { useState, type ReactNode } from "react";

import { HeaderTabs } from "@/components/admin/header-tabs";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function SettingsTabs({ general, shortcuts }: { general: ReactNode; shortcuts: ReactNode }) {
  const t = useT("settings");
  const [value, setValue] = useState<"general" | "shortcuts">("general");

  return (
    <>
      <HeaderTabs>
        <div role="tablist" aria-label={t("title")} className="flex h-full items-end gap-1">
          <Button
            type="button"
            role="tab"
            aria-selected={value === "general"}
            variant={value === "general" ? "secondary" : "ghost"}
            onClick={() => setValue("general")}
          >
            {t("general_tab")}
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={value === "shortcuts"}
            variant={value === "shortcuts" ? "secondary" : "ghost"}
            onClick={() => setValue("shortcuts")}
          >
            {t("shortcuts_tab")}
          </Button>
        </div>
      </HeaderTabs>
      <div role="tabpanel" hidden={value !== "general"}>
        {general}
      </div>
      <div role="tabpanel" hidden={value !== "shortcuts"}>
        {shortcuts}
      </div>
    </>
  );
}
