import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AdminPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ダッシュボード</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          コレクションを作成し、フィールドとアイテムを管理します。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>スキーマ管理</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/admin/collections"
            className={cn(buttonVariants(), "w-fit")}
          >
            コレクション一覧を開く
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
