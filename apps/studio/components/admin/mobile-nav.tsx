"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderIcon, HomeIcon, ImageIcon, MenuIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useScrollFade } from "@/components/ui/scroll-fade";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string };

type Props = {
  /** サイドバーと同じ行き先。**ラベルは Server 側で辞書を引いて渡す**（ここで引き直さない） */
  items: NavLink[];
  /** コレクション（動的に増える）。サイドバーの「コンテンツ」と同じもの */
  collections: NavLink[];
  /** ドロワーの中の「コンテンツ」見出し */
  contentHeading: string;
};

/**
 * SP の下部ナビ。**390px ではサイドバー（`md:flex`）が消えるので、ここが唯一の移動手段**になる。
 *
 * 🚨 これが無いと何が起きるか（実測。2026-08-13 base2）:
 *   /admin を 390px で開くと **見えている管理リンクは 2本 / nav・aside の中は 0本**。
 *   同じページを 1280px で開くと **13本 / 12本**。
 *   つまり SP では**ファイル・フォルダ・設定へ行く手段が画面に無かった**。
 *   🚨 受入ハーネスの基準3 は PC 幅で測るので、**PASS のまま見逃される**類の穴。
 *
 * 形は堀池さんの指示で決まっている（憲章 §7・原文）:
 *   「ナビなどはヘッダーとして上部ではなく、**指が届きやすい下部**にするべきだが、
 *     高さがありすぎると画面を占有するので、ちょうどいいようにする。
 *     その画面ですぐにしたいアクション（編集、保存など）は**右下**に配置して、
 *     それだとナビが少なくなるので、**左端にはサイドメニューを表示するためのアイコン**を設けておく。」
 *
 * → 左端＝メニュー / 中央＝よく行く3つ / 右端＝そのページの主要アクション。
 *   高さは `--control-h`(44px)。固定バーなので `env(safe-area-inset-bottom)` を足す。
 *
 * 🚨 面は作らない（§1）。上辺の罫線1本だけで、背景は本体と同じ。
 */
export function MobileNav({ items, collections, contentHeading }: Props) {
  const t = useT("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  useScrollFade(drawerRef, "vertical");

  // 中央に出すのは「毎日行く3つ」だけ。全部並べると指が届く大きさを保てない
  const quick = [
    { href: "/admin", label: t("home"), icon: HomeIcon },
    { href: "/admin/files", label: t("files"), icon: ImageIcon },
    { href: "/admin/folders", label: t("folders"), icon: FolderIcon },
  ];

  const isCurrent = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <nav
      aria-label={t("menu_title")}
      // 🚨 固定バーの下に iOS のホームインジケータが重なるので safe-area を足す。
      // 本体側の下 padding は layout が持つ（ここで持つと重なりが二重になる）。
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex items-center gap-1 px-2 py-1">
        {/* 左端: サイドメニューを開く */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" aria-label={t("menu_open")} />}
          >
            <MenuIcon />
          </SheetTrigger>
          <SheetContent
            side="left"
            // 🚨 スクロールするのはこの Popup 自身。行き先が増えると縦にあふれる（憲章 §6）
            ref={drawerRef}
            data-scroll-fade="vertical"
            className="w-72 overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>{t("menu_title")}</SheetTitle>
            </SheetHeader>
            {/* 面を作らない。行のリストにする（憲章 §1「SP はカードをやめて Divider」） */}
            <div className="flex flex-col px-2 pb-4">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  className={cn(
                    "flex h-(--control-h) items-center rounded-md px-3 text-sm",
                    isCurrent(item.href)
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              {collections.length > 0 ? (
                <>
                  <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">
                    {contentHeading}
                  </p>
                  {collections.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex h-(--control-h) items-center truncate rounded-md px-3 text-sm text-muted-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
                </>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>

        {/* 中央: よく行く行き先 */}
        <div className="flex min-w-0 flex-1 items-center justify-around">
          {quick.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isCurrent(href) ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "flex-col gap-0.5",
                isCurrent(href) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon />
              <span className="sr-only">{label}</span>
            </Link>
          ))}
        </div>

        {/*
          右端: そのページの主要アクション。
          🚨 中身は**ページごとに違う**ので、ここでは器だけ置いて portal の行き先にする。
          埋めるのは各ページの仕事（まだ 1 枚も埋めていない。次の工程）。
          空でも幅を確保しておかないと、埋めた瞬間に中央のナビがずれる。
        */}
        <div
          id="mobile-primary-action"
          data-slot="mobile-primary-action"
          className="flex size-(--control-h) shrink-0 items-center justify-center"
        />
      </div>
    </nav>
  );
}
