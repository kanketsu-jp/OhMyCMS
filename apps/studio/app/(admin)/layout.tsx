import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { apiFetch, currentUser } from "@/lib/admin/api";
import { GlobalSearch } from "@/components/admin/global-search";
import { LocaleSwitcher } from "@/components/admin/locale-switcher";
import { MobileNav } from "@/components/admin/mobile-nav";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { buttonVariants } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { projectName } from "@/lib/settings/project-name";
import { isOnboardingCompleted } from "@/lib/settings/service";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin/collections", labelKey: "collections" },
  { href: "/admin/files", labelKey: "files" },
  { href: "/admin/folders", labelKey: "folders" },
  { href: "/admin/notifications", labelKey: "notifications" },
  { href: "/admin/reports", labelKey: "reports" },
  { href: "/admin/settings/general", labelKey: "settings_general" },
  { href: "/admin/settings/roles", labelKey: "settings_roles" },
  { href: "/admin/settings/policies", labelKey: "settings_policies" },
  { href: "/admin/settings/users", labelKey: "settings_users" },
  { href: "/admin/settings/agents", labelKey: "settings_agents" },
  { href: "/admin/settings/version", labelKey: "settings_version" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getT("nav");
  const tCommon = await getT("common");
  const brand = await projectName(tCommon("app_name"));
  const me = await currentUser();
  if (!me.ok && me.status === 401) {
    redirect("/login");
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
    <div className="flex min-h-screen bg-background">
      {/* 面は「罫線・背景・影」のうち1つだけ（docs/design/surface-rules.md §2-1）。
          サイドバーは罫線1本で区切る。背景も付けると面が濃くなり、中の区切りが2段目になる。 */}
      <aside className="hidden w-64 shrink-0 border-r md:flex md:flex-col">
        <div className="px-4 py-4">
          <Link href="/admin" className="text-base font-semibold">
            {brand}
          </Link>
        </div>
        {/* 🚨 スクロールするのは中の ScrollFade。nav 自体には overflow を持たせない
            （持たせると、fade の付いていない要素がスクロールして監査が赤になる）。 */}
        <nav className="flex min-h-0 flex-1 flex-col">
          <ScrollFade direction="vertical" className="flex-1 space-y-6 px-3 py-4">
          <div className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </div>
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
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between border-b px-4 md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <Link href="/admin" className="font-semibold">
              {brand}
            </Link>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            {me.ok && me.data.type === "human" ? me.data.email : t("auth_error")}
          </div>
          <div className="flex items-center gap-2">
            {/* 横断検索（F2-J §2-3）。探すのは毎日あるのでヘッダに常設する。 */}
            <GlobalSearch />
            <form action="/admin/actions/logout" method="post">
              <button
                type="submit"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                <LogOut />
                {t("logout")}
              </button>
            </form>
            <LocaleSwitcher />
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
        collections={
          collections?.ok
            ? collections.data.map((row) => ({
                href: `/admin/content/${row.collection}`,
                label: row.collection,
              }))
            : []
        }
        contentHeading={t("content_heading")}
      />
    </div>
  );
}
