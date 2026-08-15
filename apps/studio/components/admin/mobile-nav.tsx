"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DatabaseIcon,
  FolderTree,
  MenuIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { GlobalSearchButton } from "@/components/admin/global-search";
import { NavLinks, type NavGroup, type NavLink } from "@/components/admin/nav-links";
import { UserMenu } from "@/components/admin/user-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useFormat, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Props = {
  /** サイドバーと同じ行き先。**ラベルは Server 側で辞書を引いて渡す**（ここで引き直さない） */
  items: NavLink[];
  /** コレクション（動的に増える）。サイドバーの「コンテンツ」と同じもの */
  collections: NavLink[];
  /** コレクションが引けなかったときに出す文。**サイドバーと同じものを渡す**（null なら「1件も無い」と区別する） */
  collectionsError: string | null;
  /** 畳んで持つ組（ファイル・設定）。**サイドバーと同じものを渡す** */
  groups: NavGroup[];
  /** 組より下に置く平リンク。**サイドバーと同じものを渡す**（通知など） */
  bottomItems: NavLink[];
  /** 下部の「不具合報告」。**サイドバーと同じ ReactNode を渡す**（中身は E 群が差し替える） */
  reports: ReactNode;
  /** ドロワーの中の「コンテンツ」見出し */
  contentHeading: string;
  /** メニュー最下部に出す、いま入っている人の表示名。取れなければ null */
  userName: string | null;
  /** メニュー最下部に出す、いま入っている人のメールアドレス。取れなければ null */
  userLabel: string | null;
  /** SSO のプロフィール画像。出せなければ null */
  userPicture: string | null;
  /** アバターに出す絵文字。画像が無いときの控え。常に何か入っている */
  userAvatarEmoji: string;
  /** SP のメニューボタンに出す、自分宛の未読通知数 */
  personalUnreadNotifications: number;
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
 *   左端＝メニュー / 残り＝よく行く行き先2つ + そのページの主要アクション。
 *   メニュー 44px を固定し、残り3つを等分する。
 *
 * 🚨 **ラベルを見せる。** 以前は `sr-only` でアイコンだけだった。
 *   堀池さんが繰り返す「**使うのは非技術者**」に対して、アイコンだけでは通じない。
 *
 * 🚨 面は作らない（§1）。上辺の罫線1本だけで、背景は本体と同じ。
 *
 * 🚨 **`bottomItems` と `reports` は必ずサイドバー（PC）と同じものを受け取る。**
 * 同じデータを PC は `left-sidebar.tsx`、SP はここで別々に描いているため、
 * 片方だけに配線すると**もう片方だけ表示が消える**（実測: 2026-08-15、layout.tsx が
 * `bottomItems`/`reports` を `<LeftSidebar>` にしか渡しておらず、SP から通知・不具合報告が
 * 消えていた）。新しい行き先を足すときは、layout.tsx がこの2つのコンポーネント**両方**に
 * 配線しているかを確認すること（`scripts/check-nav-parity.mjs` が機械的に検出する）。
 */
export function MobileNav({
  items,
  groups,
  bottomItems,
  reports,
  collections,
  collectionsError,
  contentHeading,
  userName,
  userLabel,
  userPicture,
  userAvatarEmoji,
  personalUnreadNotifications,
}: Props) {
  const t = useT("nav");
  const format = useFormat();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 🚨 中央は**2つ**。フォルダはメニューから辿れるので落とす（design ⑫。⑨ の「4つ」の訂正）。
  // 右端に split button（「編集 │ ▾」）が入ると **96px 前後**になり、アイコン1つ（44px）より 52px 広い。
  //   右が 44px なら 320px で 4個→51px（入る）
  //   右が 96px なら 320px で **4個→38px** で 44px を割る / 3個なら 51px
  // ⑨ の「4つ」は**右がアイコン1つ前提の計算**だった。
  // 🚨 2026-08-15 の堀池さんの指示で、SP フッターから通知を意図的に外した。退行ではない。
  // 原文:「SPのフッターは『お知らせ』を削除してアクションボタンにちゃんと場所を使う。」
  // 通知への導線はドロワーの中に在るので経路は切れていない。
  // 同じ日に一度「SP から通知が消えている」が退行として報告され戻されたため、この経緯を残す。
  const quick = [
    { href: "/admin/collections", label: t("collections"), icon: DatabaseIcon },
    // 🚨 画像だけでなく PDF もテキストも入る**保管場所**なので、画像のアイコンにしない。
    // 堀池さん（原文）:「/admin/files のアイコンは、**folder-tree** をつかう」
    { href: "/admin/files", label: t("files"), icon: FolderTree },
  ];

  // /admin は /admin/collections へ転送されるので、ここに「ホーム」は無い（⑰）
  const isCurrent = (href: string) => pathname.startsWith(href);
  const unreadBadge = personalUnreadNotifications > 99 ? "99+" : format.number(personalUnreadNotifications);
  const menuLabel =
    personalUnreadNotifications > 0
      ? t("menu_open_unread_notifications", { count: personalUnreadNotifications })
      : t("menu_open");

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
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={menuLabel} className="relative">
              <MenuIcon />
              {personalUnreadNotifications > 0 ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-1 -right-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs leading-none text-primary-foreground"
                >
                  {unreadBadge}
                </span>
              ) : null}
            </Button>
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
            {/* 🚨 **SP にも検索を置く。** 検索はヘッダーから左サイドバーへ移したが、
                左サイドバーは SP では出ない（`md:flex`）ので、ここに置かないと
                **SP から検索へ辿り着けなくなる**（⌘K も物理キーボードが無い）。
                置くのは起動ボタンだけで、ダイアログ本体は Provider が1つだけ描く。 */}
            <div className="shrink-0 px-4 pb-2">
              <GlobalSearchButton />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scroll-fade-y">
              {/* 面を作らない。行のリストにする（憲章 §1「SP はカードをやめて Divider」）。
                  🚨 行き先の描き方は **サイドバー（PC）と同じ部品**を使う。
                  2箇所に書くと、片方だけ直したときに PC と SP で行き先が食い違う。 */}
              <div className="flex flex-col px-2 pb-4">
                {/* 🚨 コンテンツが一番上（堀池さん指示）。メインはコレクションでなくコンテンツで、
                    毎日触るものを上に置く。PC サイドバーは既にこの並びなので、ここが逆だと食い違う。
                    🚨 **「読み込みに失敗した」と「1件も無い」は別の状態**（PC＝left-sidebar.tsx の
                    `emptyMessage` と同じ区別）。エラーを空リストのように見せない。 */}
                {collectionsError ? (
                  <>
                    <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">
                      {contentHeading}
                    </p>
                    <p className="px-3 py-1 text-xs text-muted-foreground">{collectionsError}</p>
                  </>
                ) : collections.length > 0 ? (
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
                <NavLinks items={items} groups={groups} onNavigate={() => setOpen(false)} />
                {/* 🚨 組より下＝PC の `bottomItems`（サイドバー中央の下）と同じ並び順。
                    通知など、畳まない平リンク。 */}
                {bottomItems.length > 0 ? (
                  <div className="flex flex-col">
                    {bottomItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={isCurrent(item.href) ? "page" : undefined}
                        className={cn(
                          "flex h-(--control-h) items-center truncate rounded-md px-3 text-sm",
                          isCurrent(item.href) ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {/* 🚨 PC の `SidebarFooter` と同じ位置＝一番下。中身は Server 側が渡す ReactNode
                    なので `onClick` を持たせられない。クリックがバブルする外側で閉じる。 */}
                <div onClick={() => setOpen(false)}>{reports}</div>
              </div>
            </div>
            <UserMenu
              userName={userName}
              userLabel={userLabel}
              userPicture={userPicture}
              userAvatarEmoji={userAvatarEmoji}
            />
          </SheetContent>
        </Sheet>

        {/* メニュー 44px 以外の残りを、行き先2つとアクション枠の3つで等分する。 */}
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
              <span className="max-w-full truncate text-xs leading-none">{label}</span>
            </Link>
          ))}
          {/*
            3つ目: そのページの主要アクション。
            🚨 中身は**ページごとに違う**ので、器だけ置いて portal の行き先にする。
            埋めるのは各ページの仕事（**まだ 1 枚も埋めていない**）。
            🚨 空でも幅を確保し続けること。埋めた瞬間に中央のナビがずれる
            （design ⑨-⑤ の申し送り。上の 44px の計算にもこの枠が入っている）。
          */}
          <div
            id="mobile-primary-action"
            data-slot="mobile-primary-action"
            className="flex min-w-0 flex-1 items-center justify-center"
          />
        </div>
      </div>
    </nav>
  );
}
