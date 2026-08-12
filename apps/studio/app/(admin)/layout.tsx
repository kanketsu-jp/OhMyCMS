import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import type { CollectionResult } from "@/lib/schema/models";
import { apiFetch, currentUser } from "@/lib/admin/api";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin/collections", label: "コレクション" },
  { href: "/admin/files", label: "ファイル" },
  { href: "/admin/folders", label: "フォルダ" },
  { href: "/admin/settings/roles", label: "設定 / ロール" },
  { href: "/admin/settings/policies", label: "設定 / ポリシー" },
  { href: "/admin/settings/users", label: "設定 / ユーザー" },
  { href: "/admin/settings/agents", label: "設定 / エージェント" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await currentUser();
  if (!me.ok && me.status === 401) {
    redirect("/login");
  }

  const collections = me.ok
    ? await apiFetch<CollectionResult[]>("/api/collections")
    : null;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r bg-muted/30 md:flex md:flex-col">
        <div className="border-b px-4 py-4">
          <Link href="/admin" className="text-base font-semibold">
            AI-native CMS
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
                {item.label}
              </Link>
            ))}
          </div>
          <div>
            <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">
              コンテンツ
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
                  コレクションを取得できません
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
              AI-native CMS
            </Link>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            {me.ok && me.data.type === "human" ? me.data.email : "認証エラー"}
          </div>
          <form action="/admin/actions/logout" method="post">
            <button
              type="submit"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              <LogOut />
              ログアウト
            </button>
          </form>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
