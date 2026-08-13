import Link from "next/link";
import type { CollectionResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { getT } from "@/i18n/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
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
  const t = await getT("collections");
  const params = await searchParams;
  const result = await apiFetch<CollectionResult[]>("/api/collections");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>
      <ErrorBanner message={params.error ?? (!result.ok ? result.message : null)} />
      {params.notice ? (
        <div className="text-sm text-muted-foreground">{params.notice}</div>
      ) : null}
      <Surface>
        <SurfaceTitle>{t("create_title")}</SurfaceTitle>
        <form action="/admin/actions/collections" method="post" className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="collection">{t("name_label")}</Label>
            <Input id="collection" name="collection" required pattern="[A-Za-z_][A-Za-z0-9_]*" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">{t("note_label")}</Label>
            <Input id="note" name="note" />
          </div>
          <Button type="submit">{t("create_button")}</Button>
        </form>
      </Surface>
      <Surface>
        <SurfaceTitle>{t("list_title")}</SurfaceTitle>
        {result.ok ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("title")}</TableHead>
                <TableHead>{t("field_count_header")}</TableHead>
                <TableHead>{t("note_label")}</TableHead>
                <TableHead className="w-56">{t("actions_header")}</TableHead>
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
                        {t("fields_link")}
                      </Link>
                      <Link
                        href={`/admin/content/${collection.collection}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                      >
                        {t("items_link")}
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Surface>
    </div>
  );
}
