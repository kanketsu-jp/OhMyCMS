"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import {
  BellIcon,
  BugIcon,
  ChevronDownIcon,
  DatabaseIcon,
  FilesIcon,
  FolderIcon,
  SettingsIcon,
  TableIcon,
} from "lucide-react";

import { GlobalSearchButton } from "@/components/admin/global-search";
import { matchesNavGroup, type NavGroup, type NavLink } from "@/components/admin/nav-links";
import { SHORTCUTS } from "@/components/admin/shortcuts";
import { useShortcut } from "@/components/admin/use-shortcut";
import { UserMenu } from "@/components/admin/user-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * 左サイドバー。**上部＝検索 / 中央＝メニュー / 下部＝不具合報告**の3つに分かれる。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「上部・中央・下部の３つに分けて。**上部＝ヘッダーには検索を表示**（いまのヘッダーの検索）。
 * >   今のメニューは中央に当たります。中央とはいえ、その中身のメニューは **item-center に
 * >   しなくていい。今みたいにその高さに合わせて上から配置**。下部は flex-auto や
 * >   justify-between などで下部に配置。**「不具合報告」はその下部へ移動**。」
 * > 「左サイドバーは**右のボーダーをクリックしたら閉じる**ようにする。」
 */

type ProviderProps = {
  children: ReactNode;
  defaultOpen?: boolean;
};

export function LeftSidebarProvider({ children, defaultOpen = true }: ProviderProps) {
  return <SidebarProvider defaultOpen={defaultOpen}>{children}</SidebarProvider>;
}

/** ヘッダー左端の、常に固定の開閉ボタン。 */
export function LeftSidebarToggle() {
  const { state, toggleSidebar } = useSidebar();

  useShortcut(SHORTCUTS.toggleLeftSidebar, toggleSidebar);

  return (
    <SidebarTrigger
      type="button"
      aria-expanded={state === "expanded"}
      // パンくずのドロップダウンも `aria-expanded` を持つので、名指しできる印を付ける。
      data-slot="left-sidebar-toggle"
      // SP には出さない。SP の開閉は下部ナビの左端（`mobile-nav.tsx`）が持つ。
      className="hidden text-muted-foreground md:inline-flex"
    />
  );
}

type Props = {
  brand: string;
  logo: string | null;
  /** 上部の行き先。いまは空だが、将来の平リンク用に口は残す */
  items: NavLink[];
  /** 組より下に置く平リンク */
  bottomItems: NavLink[];
  /** 畳んで持つ組（ファイル・設定） */
  groups: NavGroup[];
  /** 「コンテンツ」のディレクトリに並べるコレクション */
  collections: NavLink[];
  /** コレクションが引けなかったときに出す文 */
  collectionsError: string | null;
  /** 下部の「不具合報告」。中身は E 群が差し替える */
  reports: ReactNode;
  /** いま入っている人の表示名。出せないなら null */
  userName: string | null;
  /** いま入っている人のメールアドレス。出せないなら null */
  userLabel: string | null;
  /** SSO のプロフィール画像。出せないなら null */
  userPicture: string | null;
  /** アバターに出す絵文字。画像が無いときの控え。常に何か入っている */
  userAvatarEmoji: string;
};

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItemIcon({ href }: { href: string }) {
  if (href === "/admin/notifications") return <BellIcon />;
  return <TableIcon />;
}

function NavGroupIcon({ groupKey }: { groupKey: string }) {
  if (groupKey === "content") return <DatabaseIcon />;
  if (groupKey === "files") return <FilesIcon />;
  if (groupKey === "settings") return <SettingsIcon />;
  return <FolderIcon />;
}

function SidebarLink({ item }: { item: NavLink }) {
  const pathname = usePathname();
  const current = isCurrent(pathname, item.href);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={current} tooltip={item.label}>
        <Link href={item.href} aria-current={current ? "page" : undefined}>
          <NavItemIcon href={item.href} />
          {/* 🚨 レール（48px）では**文字を消す**。隠さないと 1文字ずつ縦に折り返して積み上がる
              （実測: 「コンテンツ」が w=14 h=100 になっていた）。アイコンとツールチップで足りる。 */}
          <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarGroupNav({ group }: { group: NavGroup }) {
  const pathname = usePathname();
  const inside = matchesNavGroup(pathname, group.match);

  return (
    <AccordionPrimitive.Item value={group.key}>
      <SidebarMenuItem>
        <AccordionPrimitive.Header className="flex">
          <SidebarMenuButton asChild isActive={inside} tooltip={group.label}>
            <AccordionPrimitive.Trigger className="group/accordion-trigger">
              <NavGroupIcon groupKey={group.key} />
              <span className="group-data-[collapsible=icon]:hidden">{group.label}</span>
              <ChevronDownIcon className="ml-auto transition-transform group-data-[collapsible=icon]:hidden group-data-[state=open]/accordion-trigger:rotate-180" />
            </AccordionPrimitive.Trigger>
          </SidebarMenuButton>
        </AccordionPrimitive.Header>
        <AccordionPrimitive.Content className="overflow-hidden data-closed:animate-accordion-up data-open:animate-accordion-down">
          <SidebarMenuSub>
            {group.children.length > 0
              ? group.children.map((item) => (
                  <SidebarMenuSubItem key={item.href}>
                    <SidebarMenuSubButton asChild isActive={isCurrent(pathname, item.href)}>
                      <Link href={item.href} aria-current={isCurrent(pathname, item.href) ? "page" : undefined}>
                        <TableIcon />
                        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))
              : group.emptyMessage
                ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      {group.emptyMessage}
                    </p>
                  )
                : null}
          </SidebarMenuSub>
        </AccordionPrimitive.Content>
      </SidebarMenuItem>
    </AccordionPrimitive.Item>
  );
}

function SidebarNav({
  items,
  bottomItems,
  groups,
  collections,
  collectionsError,
}: Pick<Props, "items" | "bottomItems" | "groups" | "collections" | "collectionsError">) {
  const t = useT("nav");
  const pathname = usePathname();
  const contentGroup: NavGroup = {
    key: "content",
    label: t("content_heading"),
    match: "/admin/content",
    children: collections,
    emptyMessage: collectionsError,
  };
  const allGroups = [contentGroup, ...groups];
  const open = allGroups.filter((group) => matchesNavGroup(pathname, group.match)).map((group) => group.key);

  return (
    <div className="flex min-h-0 flex-col gap-6 px-2 pb-2">
      {items.length > 0 ? (
        <SidebarMenu>
          {items.map((item) => (
            <SidebarLink key={item.href} item={item} />
          ))}
        </SidebarMenu>
      ) : null}

      <AccordionPrimitive.Root type="multiple" defaultValue={open} className="flex flex-col">
        <SidebarMenu>
          {allGroups.map((group) => (
            <SidebarGroupNav key={group.key} group={group} />
          ))}
        </SidebarMenu>
      </AccordionPrimitive.Root>

      {bottomItems.length > 0 ? (
        <SidebarMenu>
          {bottomItems.map((item) => (
            <SidebarLink key={item.href} item={item} />
          ))}
        </SidebarMenu>
      ) : null}
    </div>
  );
}

export function LeftSidebar({
  brand,
  logo,
  items,
  bottomItems,
  groups,
  collections,
  collectionsError,
  reports,
  userName,
  userLabel,
  userPicture,
  userAvatarEmoji,
}: Props) {
  const t = useT("nav");

  return (
    <Sidebar collapsible="icon" className="hidden md:flex">
      <SidebarHeader className="gap-3 px-2 py-3">
        <Link
          href="/admin"
          className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-base font-semibold group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- 外部URLもありうるので Image コンポーネントを使わない
            <img src={logo} alt="" className="h-6 w-auto max-w-32 shrink-0 object-contain" />
          ) : (
            <span className="shrink-0 text-sm">{brand.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="truncate group-data-[collapsible=icon]:hidden">{brand}</span>
        </Link>

        <GlobalSearchButton className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&>span]:hidden" />
      </SidebarHeader>

      <SidebarContent className="pt-1">
        {/* 🚨 ここは `<nav>` にする。ナビゲーション領域のランドマークがあると、
            読み上げの利用者が「ナビへ飛ぶ」で直接来られる。
            素の shadcn は `<div>` を出すが、それは上流の選択であって制約ではない。
            aria-label は mobile-nav.tsx の `<nav>` と同じ `menu_title`（「メニュー」）を再利用する。 */}
        <nav aria-label={t("menu_title")}>
          <SidebarNav
            items={items}
            bottomItems={bottomItems}
            groups={groups}
            collections={collections}
            collectionsError={collectionsError}
          />
        </nav>
      </SidebarContent>

      <SidebarFooter className="gap-0 p-0">
        <div className="border-t px-2 py-2">
          <div className="group-data-[collapsible=icon]:hidden">{reports}</div>
          <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={t("reports")}>
                <Link href="/admin/reports">
                  <BugIcon />
                  <span>{t("reports")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
        <div
          className={cn(
            "group-data-[collapsible=icon]:[&_[data-slot=button]]:size-8",
            "group-data-[collapsible=icon]:[&_[data-slot=button]]:justify-center",
            "group-data-[collapsible=icon]:[&_[data-slot=button]]:px-0",
            "group-data-[collapsible=icon]:[&_[data-slot=button]>span:not([data-slot=avatar])]:hidden",
            "group-data-[collapsible=icon]:[&_[data-slot=button]>svg]:hidden",
          )}
        >
          <UserMenu
            userName={userName}
            userLabel={userLabel}
            userPicture={userPicture}
            userAvatarEmoji={userAvatarEmoji}
          />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
