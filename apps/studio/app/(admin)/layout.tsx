import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch, currentUser } from "@/lib/admin/api";
import { displayUserAvatarEmoji, displayUserLabel, displayUserName, displayUserPicture } from "@/lib/admin/user-label";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { GlobalSearchProvider } from "@/components/admin/global-search";
import { HeaderBack } from "@/components/admin/header-back";
import { MobileNav } from "@/components/admin/mobile-nav";
import { LeftSidebar, LeftSidebarProvider, LeftSidebarToggle } from "@/components/admin/left-sidebar";
import { RightPanelProvider, RightPanelToggle } from "@/components/admin/right-panel";
import { getLocale, getT } from "@/i18n/server";
import { projectColor } from "@/lib/settings/project-color";
import { projectLogo } from "@/lib/settings/project-logo";
import { projectName } from "@/lib/settings/project-name";
import { SETUP_COOKIE, parseCookies } from "@/lib/auth/cookies";
import { isValidSetupSession } from "@/lib/auth/setup-session";
import { isOnboardingCompleted } from "@/lib/settings/service";

// 🚨 上位と「設定」を分ける（design ⑥）。平らに 12 行並べると、同じ接頭辞の settings_* が
// 7回続いて**上位5項目が埋もれる**。開閉に畳んで 12行 → 6行にする。
//
// 🚨 **「通知」はここに無い。** 組の下へ移した（堀池・2026-08-15）。
// 🚨 **「不具合報告」はここに無い。** 左サイドバーの**下部**へ移した（堀池・2026-08-15）。
// 🚨 **「ファイル」もここに無い。** 畳む組になった（下の `fileItems`）。
const navItems: { href: string; labelKey: string }[] = [];

const bottomNavItems = [
  { href: "/admin/notifications", labelKey: "notifications" },
];

// 「ファイルはアコーディオンにする。その中に「ストレージ」「ラベル」」（堀池・2026-08-15）
//
// 🚨 「ラベル」は **画面が出たので入れた**（storage・2026-08-15）。
//    ここは長く「API はあるが画面が無い」状態で、リンクを足すと 404 になるため空けてあった。
//    ページ・文言・リンクが揃ったので繋いだ（下の sso の行と同じ順序を守っている）。
// 🚨 組の行はリンクにならないので、**ファイル一覧そのものへの行き先を子に入れておく**。
//    入れないと `/admin/files` へ行けなくなる（SP の下部ナビからしか辿れない）。
const fileItems = [
  { href: "/admin/files", labelKey: "files_all" },
  { href: "/admin/settings/storage", labelKey: "settings_child_storage" },
  { href: "/admin/labels", labelKey: "files_child_labels" },
];

// 子は「設定 / 一般」ではなく**「一般」**。親が「設定」なので繰り返さない。
// 🚨 `settings_*`（長い方）の辞書キーは消していない。他で使われている可能性があるため。
const settingsItems = [
  { href: "/admin/collections", labelKey: "collections" },
  { href: "/admin/settings/general", labelKey: "settings_child_general" },
  { href: "/admin/settings/storage", labelKey: "settings_child_storage" },
  // 認証まわりなので general の次。ページは saml(pG) が f96973f でコミット済み
  // （🚨 一度、ページが git に入る前にリンクだけが入って「押すと 404」になった。
  //  リンク・文言・ページは**必ず同じコミットで**揃える）。
  { href: "/admin/settings/sso", labelKey: "settings_child_sso" },
  { href: "/admin/settings/roles", labelKey: "settings_child_roles" },
  { href: "/admin/settings/policies", labelKey: "settings_child_policies" },
  { href: "/admin/settings/users", labelKey: "settings_child_users" },
  { href: "/admin/settings/agents", labelKey: "settings_child_agents" },
  { href: "/admin/settings/mcp", labelKey: "settings_child_mcp" },
  { href: "/admin/settings/version", labelKey: "settings_child_version" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getT("nav");
  const tCommon = await getT("common");
  const brand = await projectName(tCommon("app_name"));
  const logo = await projectLogo();
  const accent = await projectColor();
  const me = await currentUser();
  const locale = await getLocale();
  if (!me.ok && me.status === 401) {
    // 🚨 セットアップの印を持っている人を /login へ返すと輪ができる（2026-08-13 実事故）。
    //    ログイン → /admin → /login → ログイン … を繰り返し、オンボーディングへ辿り着けない。
    //    印は「オンボーディングを通す権利」なので、**行き先はオンボーディング**が正しい。
    const setupToken = parseCookies((await headers()).get("cookie")).get(SETUP_COOKIE) ?? null;
    redirect(isValidSetupSession(setupToken) ? "/onboarding" : "/login");
  }
  // オンボーディングが済むまでは管理画面へ入れない。
  //
  // 🚨 ただし**開発環境だけ**逃げ道を開ける。DB（ohmycms_settings）は :3101 / :3102 / :3103 で
  //    共有されているため、この関門があると「オンボーディングを完了させない限り、
  //    誰も /admin を検証できない」状態が全ペインに同時に効く（実際に base2 と受入ハーネスが止まった）。
  //    ガードは dev-login と同じ形。**本番ビルドでは NODE_ENV が固定値へ展開され、分岐ごと消える。**
  const skipOnboardingGate =
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "true";
  if (!skipOnboardingGate && (await isOnboardingCompleted()) === false) {
    redirect("/onboarding");
  }

  // 🚨 サイドバーは名前しか描かない。全列のスキーマを引くと、
  // 管理画面のどのページを開いても information_schema の全走査が走る（?names=true で避ける）。
  const collections = me.ok
    ? await apiFetch<{ collection: string }[]>("/api/collections?names=true")
    : null;

  // 左サイドバー下部の「不具合報告」。
  // 🚨 **いまは一覧への行き先だけ。** 堀池の指示は「報告する」「報告一覧 / 報告管理」の
  //    アコーディオンだが、`/admin/reports/manage` のページと「報告する」を開く部品は
  //    polish(p14) が別の worktree で作っていて **main にまだ無い**。
  //    先にリンクだけ足すと**押した先が 404 になる**（このファイルの sso の行に同じ申し送りがある）。
  //    → polish の commit が main に入ったら、ここをアコーディオンへ差し替える。
  // 🚨 **組は1度だけ組み立てて、PC と SP の両方へ同じものを渡す。**
  //    2箇所に書くと、片方だけ直したときに PC と SP で行き先が食い違う
  //    （`nav-links.tsx` に同じ理由の申し送りがある）。
  const navGroups = [
    {
      key: "files",
      label: t("files"),
      match: "/admin/files",
      children: fileItems.map((item) => ({ href: item.href, label: t(item.labelKey) })),
    },
    {
      key: "settings",
      label: t("settings"),
      match: ["/admin/settings", "/admin/collections"],
      children: settingsItems.map((item) => ({ href: item.href, label: t(item.labelKey) })),
    },
  ];

  const reportsNav = (
    <Link
      href="/admin/reports"
      className="flex h-(--control-h) items-center truncate rounded-md px-3 text-sm text-muted-foreground md:h-(--control-h-pc)"
    >
      {t("reports")}
    </Link>
  );
  const sidebarCookie = (await cookies()).get("sidebar_state")?.value;
  const leftSidebarDefaultOpen = sidebarCookie !== "false";

  return (
    <div
      className="flex min-h-screen bg-background"
      // 🚨 `project_color` は**保存できるのに誰も読んでいなかった**（参照0件）。
      // ここで --primary に流し込んで、初めて「保存したら見た目が変わる」になる。
      // 設定画面は値も出所も正しく出すので、**画面を見ているかぎり気づけない**類の穴だった
      // （knowledge/decisions/verify-the-verifier.md 8番）。
      // 未設定・不正な値なら null が返り、既定の配色のままになる。
      style={accent ? ({ "--primary": accent } as React.CSSProperties) : undefined}
    >
      {/* 🚨 **左サイドバー｜コンテンツ｜右サイドバー** の3カラム（堀池・2026-08-15）。
          右サイドバーは `RightPanelProvider` が末尾に描く（開いているときだけ）。
          Provider は DOM を作らないので、flex の直下の子は aside / div / 右サイドバー のまま。 */}
      {/* 🚨 検索の本体（ダイアログと ⌘K）は**ここで1つだけ**描く。
          起動ボタンは左サイドバーと SP のドロワーの2箇所に置くので、
          部品ごとに本体を持たせるとダイアログも ⌘K の購読も2つになる。 */}
      <GlobalSearchProvider>
      <LeftSidebarProvider defaultOpen={leftSidebarDefaultOpen}>
      <RightPanelProvider brand={brand}>
      {/* 左サイドバー。**上部＝検索 / 中央＝メニュー / 下部＝不具合報告**（堀池・2026-08-15）。
          🚨 中身の並べ方は `left-sidebar.tsx` が持つ。ここは**データを渡すだけ**にする
             （開閉の状態を持つので client component。データ取得はサーバのまま）。 */}
      <LeftSidebar
        brand={brand}
        logo={logo}
        items={navItems.map((item) => ({ href: item.href, label: t(item.labelKey) }))}
        bottomItems={bottomNavItems.map((item) => ({ href: item.href, label: t(item.labelKey) }))}
        groups={navGroups}
        collections={
          collections?.ok
            ? collections.data.map((row) => ({
                href: `/admin/content/${row.collection}`,
                label: row.collection,
              }))
            : []
        }
        collectionsError={collections?.ok ? null : t("collections_error")}
        reports={reportsNav}
        // 🚨 auth が `displayUserName(me, locale)` を供えたので、null から差し替え済み。
        //    1行目には本名が出る（無ければ `UserMenu` 側の「表示名 → 無ければ辞書の控え」で埋まる）。
        userName={displayUserName(me.ok ? me.data : null, locale)}
        userLabel={displayUserLabel(me.ok ? me.data : null)}
        userPicture={displayUserPicture(me.ok ? me.data : null)}
        userAvatarEmoji={displayUserAvatarEmoji(me.ok ? me.data : null)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ヘッダーは **左｜中央｜右** の3つの塊。堀池さん（原文・2026-08-15）:
            「（一番左）と書いているのは、それらをdivでラップしているイメージ。
              大きく、左｜中央｜右　で、justify-between。」

            🚨 **メアドの常設表示は廃止した**（原文）:
            「常に表示するものはそれなりの理由・必要性がいる。
              メアド＝今だれがログインしているか？は必要ない。左サイドバーでOK」
            → いま入っている人は左サイドバー下の `UserMenu` が出す（SP はドロワーの中）。

            🚨 **SP のブランド表示もここから外した。** ヘッダーが持つのは
            「メニュー開閉・戻る・パンくず｜アクション・info」だけ、と原典が列挙している。
            ブランドはパンくずの**根**として残っており（押すと /admin へ戻る）、
            行き先を失ってはいない。 */}
        <header className="flex min-h-14 items-center justify-between gap-2 border-b px-4 md:px-6">
          {/* 左: 戻る → パンくず。
              🚨 メニュー開閉ボタン（一番左・常に固定）は**左サイドバーの開閉状態**を持つので、
                 左サイドバーを3分割する回で入れる（TODO: A群③）。 */}
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {/* 一番左は**常に固定**のメニュー開閉（堀池・2026-08-15）。 */}
            <LeftSidebarToggle />
            <HeaderBack />
            <Breadcrumbs brand={brand} />
          </div>

          {/* 中央: いまは空。ページ固有のものが要るときにここへ入れる（TODO）。
              器を先に置いておくのは、左右の塊が「中央が無いから寄っている」のか
              「中央が空だから寄っている」のかを、後から見て区別できるようにするため。 */}
          <div className="hidden min-w-0 shrink items-center md:flex" />

          {/* 右: そのページの主要アクション → info（右サイドバーの開閉）。 */}
          <div className="flex shrink-0 items-center gap-2">
            {/* 🚨 **PC の主要アクションの行き先**。中身はページごとに違うので器だけ置く。
                埋めるのは `components/admin/page-action.tsx` の portal（SP の
                `#mobile-primary-action` と対になる）。**空でも消さないこと。** */}
            <div id="header-primary-action" data-slot="header-primary-action" className="flex items-center" />
            {/* 🚨 検索は**ヘッダーから左サイドバーの上部へ移した**（堀池・2026-08-15）。
                ここには戻さないこと。 */}
            {/* 一番右。押すと右サイドバー（このページの説明）が開く。 */}
            <RightPanelToggle />
          </div>
        </header>
        {/* ヘッダー直下のタブ（堀池・2026-08-15）:
            「そのページで下層ページにせず、切り替えて表示する場合のもの。**ない場合もある**。」
            🚨 **空のときは高さも罫線も持たない。** 中身が入ったときだけ帯になる
               （`:empty` で判定する。空の帯が全ページに残ると、無いページで邪魔になる）。
            中身は各ページが `components/admin/header-tabs.tsx` から portal で差し込む。 */}
        <div
          id="header-tabs"
          data-slot="header-tabs"
          className="flex items-center gap-2 px-4 not-empty:py-2 md:px-6"
        />
        {/* 🚨 SP は下部の固定ナビに隠れるぶんの余白を本体側で持つ。
            ナビ側で持つと、safe-area の余白と二重になる。 */}
        <main className="flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-6">{children}</main>
      </div>
      {/* 🚨 390px ではサイドバー（md:flex）が消えるので、これが唯一の移動手段になる。
          外すと SP から /admin/files などへ辿り着けなくなる（実測で確認済み）。
          ラベルはここで辞書を引いて渡す（部品側で引き直さない）。 */}
      <MobileNav
        items={navItems.map((item) => ({ href: item.href, label: t(item.labelKey) }))}
        groups={navGroups}
        bottomItems={bottomNavItems.map((item) => ({ href: item.href, label: t(item.labelKey) }))}
        reports={reportsNav}
        collections={
          collections?.ok
            ? collections.data.map((row) => ({
                href: `/admin/content/${row.collection}`,
                label: row.collection,
              }))
            : []
        }
        collectionsError={collections?.ok ? null : t("collections_error")}
        contentHeading={t("content_heading")}
        // 🚨 auth が `displayUserName(me, locale)` を供えたので、null から差し替え済み。
        //    1行目には本名が出る（無ければ `UserMenu` 側の「表示名 → 無ければ辞書の控え」で埋まる）。
        userName={displayUserName(me.ok ? me.data : null, locale)}
        userLabel={displayUserLabel(me.ok ? me.data : null)}
        userPicture={displayUserPicture(me.ok ? me.data : null)}
        userAvatarEmoji={displayUserAvatarEmoji(me.ok ? me.data : null)}
      />
      {/* 🚨 `MobileNav` も Provider の中に置く。SP のドロワーから右パネルを開くものが入るため
          （不具合報告の「報告する」）。`MobileNav` は fixed なので、flex の並びには影響しない。 */}
      </RightPanelProvider>
      </LeftSidebarProvider>
      </GlobalSearchProvider>
    </div>
  );
}
