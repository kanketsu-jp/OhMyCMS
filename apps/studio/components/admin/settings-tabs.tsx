import type { ReactNode } from "react";

import { PageTabs } from "@/components/admin/page-tabs";
import { getT } from "@/i18n/server";

export async function SettingsTabs({
  general,
  shortcuts,
  tab,
}: {
  general: ReactNode;
  shortcuts: ReactNode;
  tab: "general" | "shortcuts";
}) {
  const t = await getT("settings");

  return (
    <>
      <PageTabs
        tabs={[
          {
            href: "/admin/settings/general?tab=general",
            label: t("general_tab"),
            current: tab === "general",
          },
          {
            href: "/admin/settings/general?tab=shortcuts",
            label: t("shortcuts_tab"),
            current: tab === "shortcuts",
          },
        ]}
      />
      {tab === "shortcuts" ? shortcuts : general}
    </>
  );
}
