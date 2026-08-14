"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PanelLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { GlobalSearchButton } from "@/components/admin/global-search";
import { NavLinks, type NavGroup, type NavLink } from "@/components/admin/nav-links";
import { SHORTCUTS } from "@/components/admin/shortcuts";
import { useShortcut } from "@/components/admin/use-shortcut";
import { UserMenu } from "@/components/admin/user-menu";
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

type LeftSidebarApi = { isOpen: boolean; toggle: () => void; close: () => void };

const LeftSidebarContext = createContext<LeftSidebarApi | null>(null);

function useLeftSidebar(): LeftSidebarApi {
  const value = useContext(LeftSidebarContext);
  if (!value) {
    // 作る側へのメッセージ（画面には出ない）。
    throw new Error("useLeftSidebar was called outside LeftSidebarProvider");
  }
  return value;
}

export function LeftSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);
  const close = useCallback(() => setIsOpen(false), []);
  const api = useMemo(() => ({ isOpen, toggle, close }), [isOpen, toggle, close]);
  return <LeftSidebarContext value={api}>{children}</LeftSidebarContext>;
}

/** ヘッダー左端の、常に固定の開閉ボタン。 */
export function LeftSidebarToggle() {
  const t = useT("nav");
  const { toggle, isOpen } = useLeftSidebar();

  useShortcut(SHORTCUTS.toggleLeftSidebar, toggle);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={t("menu_open")}
      aria-expanded={isOpen}
      // 🚨 パンくずのドロップダウンも `aria-expanded` を持つので、名指しできる印を付ける。
      data-slot="left-sidebar-toggle"
      // 🚨 SP には出さない。SP の開閉は下部ナビの左端（`mobile-nav.tsx`）が持っていて、
      //    2つあると「どちらが本物か」が分からなくなる。
      className="hidden text-muted-foreground md:inline-flex"
    >
      <PanelLeftIcon />
    </Button>
  );
}

type Props = {
  brand: string;
  logo: string | null;
  /** 上部の行き先（コレクション・通知） */
  items: NavLink[];
  /** 畳んで持つ組（ファイル・設定） */
  groups: NavGroup[];
  /** 「コンテンツ」のディレクトリに並べるコレクション */
  collections: NavLink[];
  /** コレクションが引けなかったときに出す文 */
  collectionsError: string | null;
  /** 下部の「不具合報告」。中身は E 群が差し替える */
  reports: ReactNode;
  /** いま入っている人。出せないなら null */
  userLabel: string | null;
};

export function LeftSidebar({
  brand,
  logo,
  items,
  groups,
  collections,
  collectionsError,
  reports,
  userLabel,
}: Props) {
  const t = useT("nav");
  const { isOpen, close } = useLeftSidebar();

  if (!isOpen) return null;

  return (
    // 面は「罫線・背景・影」のうち1つだけ（憲章 §1）。サイドバーは罫線1本で区切る。
    <aside
      data-slot="left-sidebar"
      className="relative hidden w-64 shrink-0 border-r md:flex md:flex-col"
    >
      <div className="px-4 py-4">
        <Link href="/admin" className="flex items-center gap-2 text-base font-semibold">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- 外部URLもありうるので Image コンポーネントを使わない
            <img src={logo} alt="" className="h-6 w-auto max-w-32 object-contain" />
          ) : null}
          <span className="truncate">{brand}</span>
        </Link>
      </div>

      {/* ── 上部: 検索 ────────────────────────────────────────
          🚨 ここに置くのは**起動ボタンだけ**。ダイアログ本体は `GlobalSearchProvider` が
             1つだけ描く（2箇所に置いてもダイアログも ⌘K も増えない）。 */}
      <div className="shrink-0 px-3 pb-3">
        <GlobalSearchButton />
      </div>

      {/* ── 中央: メニュー ──────────────────────────────────
          🚨 `items-center` にしない。**上から詰める**（堀池の原文どおり）。
             `flex-1` で余りを吸い、余白は下部を押し下げるためだけに使う。 */}
      <nav className="flex min-h-0 flex-1 flex-col">
        <ScrollFade direction="vertical" className="flex-1 space-y-6 px-3 pb-4">
          <NavLinks items={items} groups={groups} />

          {/* 「コンテンツ」は**ディレクトリとして**畳めるようにする（堀池の原文）。
              見出しの `<p>` を置くだけだと、増えたときに畳めない。 */}
          <NavLinks
            items={[]}
            groups={[
              {
                key: "content",
                label: t("content_heading"),
                match: "/admin/content",
                children: collections,
                emptyMessage: collectionsError,
              },
            ]}
          />
        </ScrollFade>
      </nav>

      {/* ── 下部: 不具合報告 ────────────────────────────────── */}
      <div className="shrink-0 border-t px-3 py-2">{reports}</div>

      <UserMenu userLabel={userLabel} />

      {/* 🚨 右のボーダーそのものを押して閉じる（堀池の原文）。
          罫線は 1px しかなく指でも矢印でも当てられないので、**当たり判定だけを広げた
          透明な帯**を重ねる。見た目は変えない（帯に色を付けると面が増える）。 */}
      <button
        type="button"
        onClick={close}
        aria-label={t("menu_close")}
        data-slot="left-sidebar-edge"
        className={cn(
          "absolute inset-y-0 -right-1 w-2 cursor-w-resize",
          "hover:bg-border focus-visible:bg-border focus-visible:outline-none",
        )}
      />
    </aside>
  );
}
