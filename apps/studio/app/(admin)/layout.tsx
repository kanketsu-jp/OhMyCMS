import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch, currentUser } from "@/lib/admin/api";
import { GlobalSearch } from "@/components/admin/global-search";
import { MobileNav } from "@/components/admin/mobile-nav";
import { UserMenu } from "@/components/admin/user-menu";
import { NavLinks } from "@/components/admin/nav-links";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { getT } from "@/i18n/server";
import { projectColor } from "@/lib/settings/project-color";
import { projectLogo } from "@/lib/settings/project-logo";
import { projectName } from "@/lib/settings/project-name";
import { SETUP_COOKIE, parseCookies } from "@/lib/auth/cookies";
import { isValidSetupSession } from "@/lib/auth/setup-session";
import { isOnboardingCompleted } from "@/lib/settings/service";

// 🚨 上位と「設定」を分ける（design ⑥）。平らに 12 行並べると、同じ接頭辞の settings_* が
// 7回続いて**上位5項目が埋もれる**。開閉に畳んで 12行 → 6行にする。
const navItems = [
  { href: "/admin/collections", labelKey: "collections" },
  { href: "/admin/files", labelKey: "files" },
  { href: "/admin/notifications", labelKey: "notifications" },
  { href: "/admin/reports", labelKey: "reports" },
];

// 子は「設定 / 一般」ではなく**「一般」**。親が「設定」なので繰り返さない。
// 🚨 `settings_*`（長い方）の辞書キーは消していない。他で使われている可能性があるため。
const settingsItems = [
  { href: "/admin/settings/general", labelKey: "settings_child_general" },
  // 認証まわりなので general の次。ページは saml(pG) が f96973f でコミット済み
  // （🚨 一度、ページが git に入る前にリンクだけが入って「押すと 404」になった。
  //  リンク・文言・ページは**必ず同じコミットで**揃える）。
  { href: "/admin/settings/sso", labelKey: "settings_child_sso" },
  { href: "/admin/settings/roles", labelKey: "settings_child_roles" },
  { href: "/admin/settings/policies", labelKey: "settings_child_policies" },
  { href: "/admin/settings/users", labelKey: "settings_child_users" },
  { href: "/admin/settings/agents", labelKey: "settings_child_agents" },
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
      {/* 面は「罫線・背景・影」のうち1つだけ（docs/design/surface-rules.md §2-1）。
          サイドバーは罫線1本で区切る。背景も付けると面が濃くなり、中の区切りが2段目になる。 */}
      <aside className="hidden w-64 shrink-0 border-r md:flex md:flex-col">
        <div className="px-4 py-4">
          <Link href="/admin" className="flex items-center gap-2 text-base font-semibold">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- 外部URLもありうるので Image コンポーネントを使わない
              <img src={logo} alt="" className="h-6 w-auto max-w-32 object-contain" />
            ) : null}
            <span className="truncate">{brand}</span>
          </Link>
        </div>
        {/* 🚨 スクロールするのは中の ScrollFade。nav 自体には overflow を持たせない
            （持たせると、fade の付いていない要素がスクロールして監査が赤になる）。 */}
        <nav className="flex min-h-0 flex-1 flex-col">
          <ScrollFade direction="vertical" className="flex-1 space-y-6 px-3 py-4">
          <NavLinks
            items={navItems.map((item) => ({ href: item.href, label: t(item.labelKey) }))}
            settings={settingsItems.map((item) => ({ href: item.href, label: t(item.labelKey) }))}
            settingsLabel={t("settings")}
          />
          <div>
            <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">
              {t("content_heading")}
            </p>
            <div className="space-y-1">
              {collections?.ok ? (
                collections.data.map((collection) => (
                  <Link
                    key={collection.collection}
                    href={`/admin/content/${collection.collection}`}
                    className="block truncate rounded-md px-3 py-2 text-sm hover:bg-muted"
                  >
                    {collection.collection}
                  </Link>
                ))
              ) : (
                <p className="px-3 text-xs text-muted-foreground">
                  {t("collections_error")}
                </p>
              )}
            </div>
          </div>
          </ScrollFade>
        </nav>
        {/* 🚨 PC にも置く。ここが無いと**PC からログアウトも言語切替もできない**
            （ヘッダから降ろしたとき SP のドロワーにしか置かず、実測で 0 個になっていた）。 */}
        <UserMenu userLabel={me.ok && me.data.type === "human" ? me.data.email : null} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between border-b px-4 md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <Link href="/admin" className="flex items-center gap-2 text-base font-semibold">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- 外部URLもありうるので Image コンポーネントを使わない
                <img src={logo} alt="" className="h-6 w-auto max-w-32 object-contain" />
              ) : null}
              <span className="truncate">{brand}</span>
            </Link>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            {me.ok && me.data.type === "human" ? me.data.email : t("auth_error")}
          </div>
          <div className="flex items-center gap-2">
            {/* 🚨 ヘッダに常設するのは**横断検索だけ**（憲章 §6b）。
                堀池さん（原文）:「常に表示するものはそれなりの重要度をもつ。
                ただ、この『ログアウト』『言語切り替え』はそうじゃない。個人設定という適した場所がある。」
                → どちらもメニュー最下部のユーザーの行へ移した（mobile-nav.tsx）。
                検索は毎日使うので残す。 */}
            <GlobalSearch />
          </div>
        </header>
        {/* 🚨 SP は下部の固定ナビに隠れるぶんの余白を本体側で持つ。
            ナビ側で持つと、safe-area の余白と二重になる。 */}
        <main className="flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-6">{children}</main>
      </div>
      {/* 🚨 390px ではサイドバー（md:flex）が消えるので、これが唯一の移動手段になる。
          外すと SP から /admin/files などへ辿り着けなくなる（実測で確認済み）。
          ラベルはここで辞書を引いて渡す（部品側で引き直さない）。 */}
      <MobileNav
        items={navItems.map((item) => ({ href: item.href, label: t(item.labelKey) }))}
        settings={settingsItems.map((item) => ({ href: item.href, label: t(item.labelKey) }))}
        settingsLabel={t("settings")}
        collections={
          collections?.ok
            ? collections.data.map((row) => ({
                href: `/admin/content/${row.collection}`,
                label: row.collection,
              }))
            : []
        }
        contentHeading={t("content_heading")}
        userLabel={me.ok && me.data.type === "human" ? me.data.email : null}
      />
    </div>
  );
}
