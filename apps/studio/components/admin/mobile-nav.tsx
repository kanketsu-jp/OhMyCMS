"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  DatabaseIcon,
  FolderTree,
  MenuIcon,
} from "lucide-react";
import { useState } from "react";

import { NavLinks } from "@/components/admin/nav-links";
import { UserMenu } from "@/components/admin/user-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  /** 「設定」の中に畳む行き先 */
  settings: NavLink[];
  /** 「設定」の行に出す文字 */
  settingsLabel: string;
  /** ドロワーの中の「コンテンツ」見出し */
  contentHeading: string;
  /** メニュー最下部に出す、いま入っている人。取れなければ null */
  userLabel: string | null;
};

/**
 * SP の下部ナビ。**390px ではサイドバー（`md:flex`）が消えるので、ここが唯一の移動手段**になる。
 *
 * 🚨 これが無いと何が起きるか（実測。2026-08-13 base2）:
 *   /admin を 390px で開くと **見えている管理リンクは 2本 / nav・aside の中は 0本**。
 *   同じページを 1280px で開くと **13本 / 12本**。
 *   🚨 受入ハーネスの基準3 は PC 幅で測るので、**PASS のまま見逃される**類の穴。
 *
 * 形は堀池さんの指示（憲章 §7）:
 *   左端＝メニュー / 中央＝よく行く行き先 / 右端＝そのページの主要アクション。
 *
 * 🚨 **中央は4つ。5つにしない**（design が計算・2026-08-14）。
 *   固定分（メニュー44 + Divider 9 + 主要アクション44 + 左右 padding16）を引くと、
 *   320px の端末で残り 207px。**5つだと 41px で 44px を割る**。4つなら 51px。
 *
 * 🚨 **ラベルを見せる。** 以前は `sr-only` でアイコンだけだった。
 *   堀池さんが繰り返す「**使うのは非技術者**」に対して、アイコンだけでは通じない。
 *
 * 🚨 面は作らない（§1）。上辺の罫線1本だけで、背景は本体と同じ。
 */
export function MobileNav({ items, settings, settingsLabel, collections, contentHeading, userLabel }: Props) {
  const t = useT("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 🚨 中央は**3つ**。フォルダと通知はメニューから辿れるので落とす（design ⑫。⑨ の「4つ」の訂正）。
  // 右端に split button（「編集 │ ▾」）が入ると **96px 前後**になり、アイコン1つ（44px）より 52px 広い。
  //   右が 44px なら 320px で 4個→51px（入る）
  //   右が 96px なら 320px で **4個→38px** で 44px を割る / 3個なら 51px
  // ⑨ の「4つ」は**右がアイコン1つ前提の計算**だった。
  const quick = [
    { href: "/admin/collections", label: t("collections"), icon: DatabaseIcon },
    // 🚨 画像だけでなく PDF もテキストも入る**保管場所**なので、画像のアイコンにしない。
    // 堀池さん（原文）:「/admin/files のアイコンは、**folder-tree** をつかう」
    { href: "/admin/files", label: t("files"), icon: FolderTree },
    { href: "/admin/notifications", label: t("notifications"), icon: BellIcon },
  ];

  // /admin は /admin/collections へ転送されるので、ここに「ホーム」は無い（⑰）
  const isCurrent = (href: string) => pathname.startsWith(href);

  return (
    <nav
      aria-label={t("menu_title")}
      // 🚨 固定バーの下に iOS のホームインジケータが重なるので safe-area を足す。
      // 本体側の下 padding は layout が持つ（ここで持つと重なりが二重になる）。
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex items-stretch gap-1 px-2 py-1">
        {/* 左端: サイドメニューを開く */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" aria-label={t("menu_open")} />}
          >
            <MenuIcon />
          </SheetTrigger>
          {/* 🚨 縦の flex にして、**中身だけ**をスクロールさせる。
              SheetContent 自身をスクロールさせると、下のユーザー行も一緒に流れて消える。 */}
          <SheetContent side="left" className="flex w-72 flex-col overflow-hidden">
            <SheetHeader>
              <SheetTitle>{t("menu_title")}</SheetTitle>
            </SheetHeader>
            {/* 🚨 fade を当てるのは**実際にスクロールする要素**。SheetContent 自身ではない
                （ユーザー行を下へ固定したので、スクロールするのは中の子）。
                `scroll-fade-y` は shadcn のユーティリティで、JS は要らない。 */}
            <div className="min-h-0 flex-1 overflow-y-auto scroll-fade-y">
              {/* 面を作らない。行のリストにする（憲章 §1「SP はカードをやめて Divider」）。
                  🚨 行き先の描き方は **サイドバー（PC）と同じ部品**を使う。
                  2箇所に書くと、片方だけ直したときに PC と SP で行き先が食い違う。 */}
              <div className="flex flex-col px-2 pb-4">
                <NavLinks
                  items={items}
                  settings={settings}
                  settingsLabel={settingsLabel}
                  onNavigate={() => setOpen(false)}
                />
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
            </div>
            <UserMenu userLabel={userLabel} />
          </SheetContent>
        </Sheet>

        {/* 🚨 1本の線は面ではない（囲む罫線＝4辺のときだけ面）。深さは増えない */}
        <Separator orientation="vertical" className="my-1" />

        {/* 中央: よく行く行き先。**アイコンの下に文字**を出す（アイコンだけでは通じない） */}
        <div className="flex min-w-0 flex-1 items-stretch gap-0.5">
          {quick.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isCurrent(href) ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1",
                // 🚨 当たり判定は**縦も横も** 44px を保つ。
                // `flex-1` で等分しないと、文字の長さで幅が決まってしまう
                // （実測で "Files" が 29px しかなかった。design の計算は等分で 51px の前提）。
                "min-h-(--control-h)",
                isCurrent(href) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="max-w-full truncate text-[0.625rem] leading-none">{label}</span>
            </Link>
          ))}
        </div>

        {/*
          右端: そのページの主要アクション。
          🚨 中身は**ページごとに違う**ので、器だけ置いて portal の行き先にする。
          埋めるのは各ページの仕事（**まだ 1 枚も埋めていない**）。
          🚨 空でも幅を確保し続けること。埋めた瞬間に中央のナビがずれる
          （design ⑨-⑤ の申し送り。上の 44px の計算にもこの枠が入っている）。
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
