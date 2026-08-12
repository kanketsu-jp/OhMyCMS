import Link from "next/link";
import type { CollectionResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function CollectionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const result = await apiFetch<CollectionResult[]>("/api/collections");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">コレクション</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          テーブルを作成し、フィールド定義へ進みます。
        </p>
      </div>
      <ErrorBanner message={params.error ?? (!result.ok ? result.message : null)} />
      {params.notice ? (
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">{params.notice}</div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>新規作成</CardTitle>
        </CardHeader>
        <CardContent>
          <form action="/admin/actions/collections" method="post" className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="collection">コレクション名</Label>
              <Input id="collection" name="collection" required pattern="[A-Za-z_][A-Za-z0-9_]*" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">メモ</Label>
              <Input id="note" name="note" />
            </div>
            <Button type="submit">作成</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {result.ok ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>コレクション</TableHead>
                  <TableHead>フィールド数</TableHead>
                  <TableHead>メモ</TableHead>
                  <TableHead className="w-56">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((collection) => (
                  <TableRow key={collection.collection}>
                    <TableCell className="font-medium">{collection.collection}</TableCell>
                    <TableCell>{collection.schema?.columns.length ?? 0}</TableCell>
                    <TableCell>{collection.meta?.note ?? ""}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Link
                          href={`/admin/collections/${collection.collection}`}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                        >
                          フィールド
                        </Link>
                        <Link
                          href={`/admin/content/${collection.collection}`}
                          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                        >
                          アイテム
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
