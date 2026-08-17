import Link from "next/link";
import type { CollectionResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ErrorBanner } from "@/components/admin/error-banner";
import { ListEmpty } from "@/components/admin/list-empty";
import { CollectionIconFor } from "@/components/admin/left-sidebar";
import { HeaderSearch } from "@/components/admin/header-search";
import { PageAction } from "@/components/admin/page-action";
import { sectionAnchorId } from "@/components/admin/page-sections";
import { Plus } from "lucide-react";
import { errorKeyFromQuery } from "@/i18n/error";
import { getLocale, getT } from "@/i18n/server";
import { collectionLabel } from "@/lib/schema/collection-labels";
import { buttonVariants } from "@/components/ui/button";
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
  // 🚨 `q` は**ヘッダーの絞り込み窓**が書く（`components/admin/header-search.tsx`）。
  //    書くのは窓、絞るのはこの画面、という分担にしてある。
  searchParams: Promise<{ error?: string; q?: string }>;
};

export default async function CollectionsPage({ searchParams }: Props) {
  const params = await searchParams;
  // 🚨 URL の値は鍵としてしか受け取らない（許可リスト・fail closed）。i18n/error.ts 参照。
  const tError = await getT("errors");
  const errorKey = errorKeyFromQuery(params.error);
  const errorMessage = errorKey ? tError(errorKey) : null;
  const t = await getT("collections");
  const locale = await getLocale();
  const result = await apiFetch<CollectionResult[]>("/api/collections");
  // 🚨 **この画面の中を絞る**（堀池・2026-08-17・L1「このページでの検索窓」）。
  //    識別子と表示名の**両方**で見る——画面には 2 行（表示名 / 識別子）が出ているので、
  //    見えている文字で絞れないと「打ったのに出ない」になる。
  //    🚨 大文字小文字は無視する（識別子は小文字、表示名は日本語で混ざるため）。
  const query = (params.q ?? "").trim().toLowerCase();
  // 🚨 **絞りを外した行き先**（他のクエリは保つ）。`files/page.tsx` の `clearLabelHref` と同じ形。
  const clearQueryHref = (() => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "q" || value === undefined || value === "") continue;
      next.append(key, String(value));
    }
    const search = next.toString();
    return search ? `/admin/collections?${search}` : "/admin/collections";
  })();
  const rows = result.ok
    ? result.data.filter(
        (c) =>
          query === "" ||
          c.collection.toLowerCase().includes(query) ||
          collectionLabel(c, locale).toLowerCase().includes(query),
      )
    : [];

  return (
    <div className="max-w-6xl space-y-6">
      {/* 🚨 一覧のページは**まず一覧を見せる**（design ⑰）。作成フォームは
          /admin/collections/new へ移した。入口はこの主要アクション。

          🚨 **見出しと概要をここに置かない**（堀池・2026-08-15）:
          > 「…は必要ない。理由はタイトルはパンクズで表示するのと、
          >   その下の概要は『info』アイコンで説明する。」
          → 文言は消さず `lib/admin/page-meta.ts` の辞書キーとして残してある
            （右サイドバー・Storybook・LLM がそこから読む）。
          🚨 パンくずと右サイドバーは **ui ペインが作る**。**それが入るまで、
             この画面にはページ名がどこにも出ない**（意図した中間状態）。 */}
      {/* 🚨 **囲まない。** `PageAction` は PC も SP も portal で外（ヘッダー / 下部ナビ）へ出る
          ので、ここに残る中身は無い。以前あった `<div className="flex justify-end">` は
          **何も入っていないのに縦の余白だけ取っていた**（shell 583cf84 の申し送り）。 */}
      {/* 🚨 **この画面の中を絞る窓**をヘッダーへ差し込む（L1・2026-08-17）。
          全体検索（⌘K）とは別物で、あちらは左サイドバーのまま。
          🚨 これは header(L3) が入れた 1 行。**一覧の出し分け（§1-5 / §1-6）には触っていない。** */}
      <HeaderSearch />
      <PageAction
        href="/admin/collections/new"
        label={t("new_button")}
        icon={<Plus />}
      />
      {/* 🚨 **`params.error` を直接渡さないこと**（2026-08-15 の統合で一度そう書かれていた）。
          あれは URL の自由文字列で、**アプリ本物のエラー枠の中に攻撃者の文章が出る**
          （なりすまし表示。XSS ではないが、電話番号を出せばそのまま偽ページになる）。
          `errorKeyFromQuery` の許可リストを通した `errorMessage` だけを渡す。
          対応の無いコードは汎用文言へ落ちる（fail closed）。 */}
      <ErrorBanner message={errorMessage ?? (!result.ok ? tError(result.messageKey) : null)} />
      {/* 🚨 **枠で囲まない**（堀池・2026-08-15）:
          > 「ボーダー＋Padding はいらない。親要素にすでに Padding があるのと、
          >   カードコンポーネントを多用するのはデザインスキルが低い。
          >   **枠というのは明確な別の領域を表現する**が、…コレクション一覧しか
          >   セクションがないので、ボーダーも Padding も必要ない。
          >   **ただし、2つ要素が並ぶ場合は、その間に Divider を用意する**。」
          → このページの節は一覧ひとつだけなので、`Surface` で包まない。
          🚨 見出し（「一覧」）も出さない。「そもそも見てわかるので」。
             ただし**右サイドバーの項目一覧には出す**ので、辞書キーは
             `lib/admin/page-meta.ts` の `sectionKeys` に残してある。 */}
      <div id={sectionAnchorId("collections.list_title")}>
        {result.ok ? (
          rows.length > 0 ? (
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
                {rows.map((collection) => {
                  const encoded = encodeURIComponent(collection.collection);
                  return (
                    <TableRow key={collection.collection}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2">
                          <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4">
                            <CollectionIconFor
                              icon={collection.meta?.icon ?? null}
                              collection={collection.collection}
                            />
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="font-medium">{collectionLabel(collection, locale)}</span>
                            <span className="text-xs text-muted-foreground">{collection.collection}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{collection.schema?.columns.length ?? 0}</TableCell>
                      <TableCell>{collection.meta?.note ?? ""}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Link
                            href={`/admin/collections/${encoded}`}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                          >
                            {t("fields_link")}
                          </Link>
                          <Link
                            href={`/admin/content/${encoded}`}
                            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                          >
                            {t("items_link")}
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : query ? (
            /* 🚨 **「絞り込んだ結果 0 件」と「元から空」は別物**（`list-empty.tsx` の冒頭が
                そう決めている。**規約は在ったのに、私が絞り込みを入れたとき分けなかった**）。
                【測った 2026-08-17】直す前は `?q=zz-not-real` で「**コレクションはまだありません**」
                と出ていた。**コレクションは 16 件在る**ので、これは嘘で、
                利用者からは「**データが消えた**」と読める。しかも**解除する手段が本文に 0 件**だった。
                🚨 文言と解除の出し方は `files/page.tsx` の前例に揃えている（新しい言い回しを作らない）。 */
            <ListEmpty>
              {t("empty_filtered")}{" "}
              <Link href={clearQueryHref} className="underline">
                {t("clear_filter")}
              </Link>
            </ListEmpty>
          ) : (
            <ListEmpty>
              {t("empty")}{" "}
              <Link href="/admin/collections/new" className={cn(buttonVariants({ size: "sm" }))}>
                <Plus data-icon="inline-start" />
                {t("empty_create_action")}
              </Link>
            </ListEmpty>
          )
        ) : null}
      </div>
    </div>
  );
}
