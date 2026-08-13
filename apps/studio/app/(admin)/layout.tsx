import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { apiFetch, currentUser } from "@/lib/admin/api";
import { GlobalSearch } from "@/components/admin/global-search";
import { LocaleSwitcher } from "@/components/admin/locale-switcher";
import { buttonVariants } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { projectName } from "@/lib/settings/project-name";
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
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
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
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
