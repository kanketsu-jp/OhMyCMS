"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import {
  BellIcon,
  BugIcon,
  ChevronDownIcon,
  Cloud,
  Columns3,
  DatabaseIcon,
  FilesIcon,
  FileIcon,
  FolderIcon,
  FolderTree,
  ImageIcon,
  Info,
  KeyRound,
  Link2,
  List,
  Lock,
  RefreshCw,
  SettingsIcon,
  ShieldAlert,
  SquareCode,
  TableIcon,
  Tag,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";

import {
  COLLECTION_ICONS,
  DEFAULT_COLLECTION_ICON,
  collectionIconFor,
  type CollectionIcon,
} from "@/lib/admin/collection-icons";

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
 * 左サイドバー。**上部＝検索 / 中央＝メニュー / 下部＝利用者操作**の3つに分かれる。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「上部・中央・下部の３つに分けて。**上部＝ヘッダーには検索を表示**（いまのヘッダーの検索）。
 * >   今のメニューは中央に当たります。中央とはいえ、その中身のメニューは **item-center に
 * >   しなくていい。今みたいにその高さに合わせて上から配置**。下部は flex-auto や
 * >   justify-between などで下部に配置。」
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
  // 🚨 ゴミ箱に**表のアイコン**が出ていた（堀池・2026-08-17・K1「ゴミ箱のアイコンが不自然」）。
  //    ここに分岐が無く、`/admin/trash` が既定の `<TableIcon />` に落ちていたため。
  //    【測った】直す前: この行の svg は `lucide lucide-table`（d は表の罫線）。
  //    🟢 対照 `/admin/notifications` は `lucide-bell` が取れていた ＝ 取り出し方は動いていた
  //    ＝ **「ゴミ箱が 0 件」は見ていない 0 ではなく、表アイコンが入っていた**。
  // 🚨 `Trash2` はこのリポジトリで既に **8 ファイル**が使っている標準のゴミ箱
  //    （`git grep -l Trash2 -- components app`）。**新しい絵を選ばないこと**——
  //    同じ意味に 2 つの絵が出る。
  if (href === "/admin/trash") return <Trash2Icon />;
  // 🚨 **既定に落ちていたのは trash だけではなかった**（司令塔の実測・2026-08-17）。
  //    組の子は下で `<TableIcon />` を**べた書き**していたので、
  //    「すべてのファイル」「ラベル」「ユーザー」「ロール」「ポリシー」の **5 行**が表のアイコンだった。
  //    ＝ 堀池さんが名指ししたのは「ゴミ箱」1 件だが、**原因は既定に落ちること**なので、
  //      1 件だけ直すと残りは次に気づかれる。
  // 🚨 **絵は、既にこのリポジトリで使っているものから採る**（同じ意味に 2 つの絵を作らない）。
  //    Tag … 3 箇所／ShieldAlert … policies-manager／KeyRound … 2 箇所／FileIcon … 4 箇所
  if (href === "/admin/files") return <FileIcon />;
  if (href === "/admin/labels") return <Tag />;
  if (href === "/admin/settings/policies") return <ShieldAlert />;
  if (href === "/admin/settings/roles") return <KeyRound />;
  // 🚨 **ここだけ、既存に無い絵を入れた。** 利用者を表す絵はこのリポジトリに 1 つも無く
  //    （`UserMinus` は「利用者を外す」で別物）、**重複が起きない**ため。
  if (href === "/admin/settings/users") return <UsersIcon />;
  // 🚨 **設定の子も既定に落ちていた**（堀池・2026-08-17・S1「設定のアイコンもちゃんと個別に設定」）。
  //    【測った】組を **2 周開いてから**数えると、行 38 のうち
  //    設定側で `lucide-table` が **8 件**（コレクション / 一般 / ストレージ / SSO /
  //    エージェント / MCP 接続 / バージョン / 報告管理）。
  //    🚨 1 周だと取り切れない（開いた中にさらに閉じた組が在る）。司令塔も私も、
  //      **閉じたまま数えて「直った」と誤報している**。
  // 🚨 絵はすべて**既にこのリポジトリで使っているもの**（同じ意味に 2 つの絵を作らない）。
  if (href === "/admin/collections") return <Columns3 />;
  if (href === "/admin/settings/general") return <Info />;
  if (href === "/admin/settings/storage") return <Cloud />;
  if (href === "/admin/settings/sso") return <Lock />;
  // 🚨 **AI の入口が 1 つになった**（pages の AF1・9bbdd348）ので、`/admin/settings/ai` を足す。
  //    足さないと既定の `<TableIcon />` に落ちる（`DESIGN.md` §3-1）。
  //    【測った 2026-08-17】S1 の直後は 0 件だったのに、**行が 1 つ増えて 1 件に戻っていた**
  //    ＝ 🚨 **既定に落ちる形は、他レーンが項目を足すたびに再発する**。
  //      この分岐は「守り手が居ない約束」なので、次に増える人も同じところで落ちる。
  // 🚨 `agents` / `mcp` の分岐は**消していない**。ページ自体は残っており
  //    （実測: 3 つとも page.tsx が在る）、直接 URL で開けば道筋に出るため。
  if (href === "/admin/settings/ai") return <SquareCode />;
  if (href === "/admin/settings/agents") return <SquareCode />;
  if (href === "/admin/settings/mcp") return <Link2 />;
  // 🚨 auth の AH1（f8bb53d7）で **バージョンが設定から出て `/admin/version` へ移った**。
  //    古い道（`/admin/settings/version`）も残す——ページは実在し、直接 URL で開けるため。
  //    【測った 2026-08-17】移った直後、新しい道が既定の table に落ちていた。
  //    ＝ 🚨 **既定落ちは、他レーンが行を動かすたびに再発する**（今日 2 度目）。
  if (href === "/admin/version") return <RefreshCw />;
  if (href === "/admin/settings/version") return <RefreshCw />;
  // 🚨 クエリ付き（`?scope=all`）なので **前方一致**で見る。完全一致だと当たらない。
  //    絵は左サイドバー下部の「不具合報告」と**同じ BugIcon**——**同じ意味だから同じ絵が正しい**
  //    （禁じられているのは「同じ意味に 2 つの絵」）。
  if (href.startsWith("/admin/reports")) return <BugIcon />;
  return <TableIcon />;
}

/**
 * コレクションが選べるアイコンの、**名前 → 部品**の対応表（K2・堀池さん 2026-08-17）。
 *
 * 🚨 **ここが「先に import してある」の実体。** lucide-react 1.31.0 は遅延読み込みの口を
 *    持たない（実測: `exports` に該当 0 件）ので、**書いた名前しか描けない**。
 *    ＝ 一覧（`collection-icons.ts`）とこの表は**必ず同じ鍵を持つ**。
 * 🚨 ずれると「選べるのに描けない」になるので、下の型で**コンパイル時に落ちる**ようにしてある
 *    （`Record<CollectionIcon, ...>` は鍵が 1 つでも欠けると型エラー）。
 */
const COLLECTION_ICON_COMPONENTS: Record<CollectionIcon, typeof TableIcon> = {
  table: TableIcon,
  database: DatabaseIcon,
  file: FileIcon,
  files: FilesIcon,
  folder: FolderIcon,
  "folder-tree": FolderTree,
  image: ImageIcon,
  list: List,
  tag: Tag,
  users: UsersIcon,
  "key-round": KeyRound,
  "shield-alert": ShieldAlert,
};

/**
 * 保存されている名前から部品を引く。**知らない名前・未選択は既定へ落とす**（画面を壊さない）。
 *
 * 🚨 `collection` を渡すと、**選んでいないときに名前から散らす**（`collectionIconFor`）。
 *    渡さないときは `table` のまま（選ぶ画面の見本など、散らしたくない場所のため）。
 *    【測った 2026-08-17】渡す前は左サイドバーの **16 件が全部 `table`** だった。
 */
export function CollectionIconFor({ icon, collection }: { icon: string | null; collection?: string }) {
  const key = collection
    ? collectionIconFor(collection, icon)
    : (COLLECTION_ICONS as readonly string[]).includes(icon ?? "")
      ? (icon as CollectionIcon)
      : DEFAULT_COLLECTION_ICON;
  const Icon = COLLECTION_ICON_COMPONENTS[key];
  return <Icon />;
}

function NavGroupIcon({ groupKey }: { groupKey: string }) {
  if (groupKey === "content") return <DatabaseIcon />;
  if (groupKey === "files") return <FilesIcon />;
  if (groupKey === "settings") return <SettingsIcon />;
  // 🚨 G2 で足された「ユーザー」の組が、既定の `<FolderIcon />`（フォルダ）に落ちていた。
  //    人の集まりをフォルダの絵で表していたので、子の `/admin/settings/users` と揃える。
  if (groupKey === "users") return <UsersIcon />;
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
  // 🚨 畳んでいるかを知るために要る（M1）。開く口も同じ hook が持つ。
  const { state, setOpen } = useSidebar();
  const inside = matchesNavGroup(pathname, group.match);

  return (
    <AccordionPrimitive.Item value={group.key}>
      <SidebarMenuItem>
        <AccordionPrimitive.Header className="flex">
          <SidebarMenuButton asChild isActive={inside} tooltip={group.label}>
            <AccordionPrimitive.Trigger
              className="group/accordion-trigger"
              // 🚨 **畳んでいるときは、まずサイドバーを開く**（堀池・2026-08-17 M1 原文
              //    「左サイドバーをとじたらクリックできない。アコーディオンはクリックしたら
              //      左サイドバーを開くか、最初の一つのページに遷移するか、パネルを出すようにして。」）。
              //    🚨 畳むと**子リンクが 0 件になる**ので、残るのは見出しだけで押す先が無い
              //    （2026-08-17 実測: 押しても経路も状態も浮くものも変わらない）。
              //
              // 🚨 **3 択のうち 1（押したら開く）を選んだ。理由:**
              //    ・2（最初の 1 つへ遷移）… 「最初の 1 つ」が組ごとに違い、コレクションは
              //      実行時に変わる。0 件のときの行き先も決めることになり、4 組ぶん抱える
              //    ・3（浮かせる）… いまのサイドバーに popover / hover-card は 0 件（実測）。
              //      Directus は 3 に近いが、向こうは「畳んでも子を出す」作りで構造が違う
              //    🚨 失うもの … 畳んだまま中身を見ることはできない（開いてしまう）。
              onClick={(event) => {
                if (state !== "collapsed") return;
                // 🚨 開くだけにする。Accordion の開閉も走ると、開いた直後に組が畳まれて
                //    「押したのに閉じている」に見える。
                event.preventDefault();
                setOpen(true);
              }}
            >
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
                        {/* 🚨 **べた書きの `<TableIcon />` をやめた**（2026-08-17）。
                            組の子が**全部 表のアイコン**になっていた原因がここ。
                            トップ項目と**同じ関数**を通す（分岐を 2 箇所に持つと必ず割れる）。
                            🚨 コレクションの行もここを通るので、**既定は `TableIcon` のまま残す**
                            （表であることは正しい。K2 で 1 件ずつ持たせる話は別）。 */}
                        {/* 🚨 コレクションの行だけ、自分のアイコンを持つ（K2）。
                            持っていない行（設定の子など）は既定の分岐へ落ちるので、
                            **渡していない行の見た目は変わらない**。 */}
                        {/* 🚨 コレクションの行は**選んでいなくても固有の絵**にする（司令塔の決め・2026-08-17）。
                            名前を渡すと `collectionIconFor` が名前から散らす。
                            それ以外の行（設定の子など）は従来どおり分岐へ落とす。 */}
                        {item.href.startsWith("/admin/content/") ? (
                          <CollectionIconFor
                            icon={item.icon ?? null}
                            collection={decodeURIComponent(item.href.slice("/admin/content/".length))}
                          />
                        ) : item.icon ? (
                          <CollectionIconFor icon={item.icon} />
                        ) : (
                          <NavItemIcon href={item.href} />
                        )}
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
          // 🚨 `h-` のまま（`min-h-` にしない）。ここは**高さを固定したい**行で、
          //    `min-h-` にすると中身の自然な高さまで伸びる（sidebar.tsx で親の行が 32→36px に伸びた）。
          //    32px は `--control-h-pc-sm`＝サイドバーの行の高さと同じ段。
          className="flex h-(--control-h-pc-sm) min-w-0 items-center gap-2 rounded-md px-2 text-base font-semibold group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
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
        {/*
          🚨 **中身が 0 件のとき、器と線を残さない**（堀池・2026-08-17 R1 原文「謎のボーダーがあるので削除」／
             DESIGN.md §1-4）。
          🚨 **「0 件だから消す」ではなく「なぜ 0 件か」を先に測った**（2026-08-17）:
             この中身（不具合報告）は `hidden group-data-[collapsible=icon]:flex` で、
             **畳んだときだけ出る**。開いているときは I1 でユーザーメニューへ移したので、
             ここは**元から空**になる。
             ＝ 「入るはずのものが 0 件」ではなく「開いているときは要らない」が正しい。
          ＝ 線と余白も**畳んだときだけ**出す。開いているときは器ごと消える。
        */}
        <div className="hidden border-t px-2 py-2 group-data-[collapsible=icon]:block">
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
