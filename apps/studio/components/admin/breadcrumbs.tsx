"use client";

import { useRouter, usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/client";
import { pageMeta } from "@/lib/admin/page-meta";

/**
 * ヘッダーのパンくず。**ページ名の置き場所はここだけ**になる。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「今のページのタイトル（１０文字以上は「...」で省略）のみで、
 * >   それより前のページは「├XXX」「└XXX」で表示させ、押下で戻る。」
 * > 「（ページ上部の見出しは）必要ない。理由はタイトルはパンクズで表示するのと、
 * >   その下の概要は『info』アイコンで説明する。」
 *
 * 🚨 **ページ名の出所は `lib/admin/page-meta.ts` ただ1つ**（design が作った定義）。
 *    ここで名前を持たない。持つと、右サイドバーの「概要」と食い違う。
 */

/** 現在地に出す文字数の上限。これを超えたら畳む。 */
const MAX_TITLE_LENGTH = 10;

type Crumb = { href: string; label: string };

function shorten(label: string): string {
  return label.length > MAX_TITLE_LENGTH
    ? `${label.slice(0, MAX_TITLE_LENGTH)}…`
    : label;
}

/**
 * パスから道筋を組み立てる。
 *
 * 🚨 **実在しない中間パスは出さない。** `/admin/settings` や `/admin/content` には
 *    ページが無い（`app/(admin)/` に `page.tsx` が無い）。出すと「押すと 404」になる。
 *    判定は `pageMeta()` に任せる（ここでルート表を持たない）。
 *
 * 🚨 現在地だけは、定義が無くても必ず出す。出さないと**画面に名前が1つも出ない**
 *    （ページ本文から見出しを消したので、ここが唯一の表示場所になった）。
 */
function buildTrail(pathname: string, brand: string, t: (key: string) => string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];

  segments.forEach((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const isCurrent = index === segments.length - 1;

    // 道筋の根はプロジェクト名。`/admin` は辞書ではなく**設定された名前**で呼ぶ。
    if (href === "/admin") {
      crumbs.push({ href, label: brand });
      return;
    }

    const meta = pageMeta(href);
    if (!meta) {
      if (isCurrent) crumbs.push({ href, label: segment });
      return;
    }

    // `titleFromData` は「名前は実データ側にある」という印。
    // レイアウトはそのデータを持たないので、URL の区間をそのまま名前にする
    // （コレクション名はそれ自体が名前なので、これで正しく出る）。
    crumbs.push({ href, label: meta.titleFromData ? segment : t(meta.titleKey) });
  });

  return crumbs;
}

export function Breadcrumbs({ brand }: { brand: string }) {
  // 名前空間を付けない。`page-meta.ts` が持つのは名前空間込みの完全なキー
  //（"collections.title" など）なので、ここで前置きすると二重になる。
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();

  const crumbs = buildTrail(pathname, brand, t);
  const current = crumbs[crumbs.length - 1];
  const parents = crumbs.slice(0, -1);

  if (!current) return null;

  return (
    <Breadcrumb aria-label={t("nav.breadcrumb_label")} className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1">
        {parents.length > 0 ? (
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={t("nav.breadcrumb_parents")}
                    // 🚨 **指で押せる大きさを持たせる**（憲章 §7 の 44px）。
                    //    アイコンは小さいままでよいが、**当たり判定は縦も横も 44px**にする。
                    //    `size-6`（24px）だと SP で押せない（design が14ページ分を実測）。
                    //    アイコンを大きくするのではなく、箱を広げるのが正しい（InputGroupButton と同じ手）。
                    className="flex min-h-(--control-h) min-w-(--control-h) items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:min-h-(--control-h-pc) md:min-w-(--control-h-pc)"
                  />
                }
              >
                <ChevronDownIcon className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuGroup>
                  {parents.map((crumb, index) => (
                    <DropdownMenuItem
                      key={crumb.href}
                      onClick={() => router.push(crumb.href)}
                    >
                      {/* 木の枝の記号。最後（＝ひとつ上の階層）だけ └ にする。
                          記号なので辞書には載せない（文言ではない）。 */}
                      <span className="truncate">
                        {index === parents.length - 1 ? "└" : "├"}
                        {crumb.label}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
        ) : null}

        <BreadcrumbItem className="min-w-0">
          {/* 畳んだときに全体が読めるよう、元の名前を title に残す。 */}
          <BreadcrumbPage title={current.label} className="truncate">
            {shorten(current.label)}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
