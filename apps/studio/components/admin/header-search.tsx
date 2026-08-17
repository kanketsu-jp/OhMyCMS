"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";

/**
 * **その画面の中を絞る**検索窓。ヘッダーの中央へ差し込む。
 *
 * 由来（堀池・2026-08-17・L1 の画像の注記・原文）:
 * > 「このページでの検索窓は、横幅が十分にある時のみ表示」
 *
 * ## 🚨 左サイドバーの検索とは**別物**（司令塔の決め・2026-08-17）
 *
 * ```
 * 左サイドバー … **全体検索**（⌘K）。2026-08-15 に「ヘッダーへ戻さない」と決めた分。**動かさない**
 * ここ ………… **その画面の中の絞り込み**。画面ごとに対象が違うので、その画面に在るのが自然
 * ```
 * 🚨 **同じ「検索」でも役目が違う。** `layout.tsx` の「ここには戻さないこと」という申し送りは
 * **全体検索のこと**で、これはそれに当たらない（司令塔が切り分けた）。
 *
 * ## 置き方は `PageAction` と同じ（DRY・`DESIGN.md` §0-1）
 *
 * ヘッダーの枠 `#header-search` へ **portal** で差し込む。**新しい仕組みを作っていない**——
 * 主操作（`#header-primary-action`）・タブ（`#header-tabs`）と同じ形。
 *
 * ## 🚨 横幅が十分なときだけ出す
 *
 * `hidden lg:flex` で **1024px 以上**のときだけ出す。狭いときは**枠ごと出さない**
 * （`DESIGN.md` §1-4「中身が 0 件のとき、器と線を残さない」と同じ考え方）。
 * 🚨 出さないだけで、**絞り込み自体は URL の `?q=` に残る**ので、
 * 幅の広い画面で絞ってから狭くしても結果は変わらない。
 *
 * ## 使う側（3 行）
 *
 * ```tsx
 * <HeaderSearch placeholder={t("filter_placeholder")} />
 * // ページ側は searchParams.q を読んで絞る（このコンポーネントは URL を書くだけ）
 * ```
 * 🚨 **絞り込みそのものはここでやらない。** 何をどう絞るかは画面ごとに違うので、
 * ここは「`?q=` を書く／消す」だけを持つ。**表の中身に触らない**。
 */
export function HeaderSearch({ placeholder }: { placeholder?: string }) {
  const t = useT("search");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const slot = useSlot("header-search");

  const current = params.get("q") ?? "";

  const apply = (value: string) => {
    const next = new URLSearchParams(params.toString());
    // 🚨 空文字は鍵ごと落とす。残すと `?q=` が URL に居座り、
    //    「絞っていないのに絞っているように見える」状態になる。
    if (value) next.set("q", value);
    else next.delete("q");
    // 🚨 ページ送りは 1 ページ目へ戻す。絞ったのに 3 ページ目のままだと、
    //    **結果が在るのに空に見える**（`pagination-href.ts` と同じ考え方）。
    next.delete("page");
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname);
  };

  if (!slot) return null;

  return createPortal(
    // 🚨 **1024px 未満では出さない**（堀池さんの注記「横幅が十分にある時のみ表示」）。
    //    ヘッダーは狭いときパンくずと主操作で埋まるので、足すと**パンくずが潰れる**
    //    （2026-08-15 に同じ形で実際に潰れた記録が `breadcrumbs.tsx` に在る）。
    // 🚨 **区画ごと地の色を敷く**（`DESIGN.md` §2-8「入力欄に見えるものは、打てること。
    //    あわせて**地の色と同化させない**」）。
    //    【測った 2026-08-17】直す前は入力の地が `rgba(0,0,0,0)`・枠 `0px` で、
    //    **在ることを示すのはアイコンと placeholder だけ**だった
    //    ＝ 堀池さんが最初に「背景色と同化してわかりずらい」と言った形と同じ。
    //    🚨 **入力そのものに面を付けない。** ヘッダーは平ら（角丸なし・区画が隙間なく並ぶ）なので、
    //      入力に箱を作ると**区画の中に箱**という二重の面になる（`no-nested-surfaces`）。
    //      代わりに**区画いっぱいに地を敷く**ので、角も隙間も生まれない。
    //    🚨 **色は `--input`（229）を使う。新しい色を作らない。**
    //      【測った】白（--background = 255）に重ねた差:
    //         `bg-muted/50` … 250 ＝ **差 5 / 255**（schema が「差 2 は見えない」と測った範囲と同じ）
    //         `bg-input` ……… 229 ＝ **差 26 / 255**
    //      schema の AN1 が「**編集できる欄 = `--input`**」に寄せているので、それに合わせた
    //      （ここは実際に打てる欄なので、同じ語彙で正しい）。
    //    🚨 **AN1 はここには届かない。** この入力は `bg-transparent` を自分で指定しており、
    //      `components/ui/input.tsx` を変えても上書きされる（だから区画側に敷いている）。
    <div className="hidden min-w-0 flex-1 items-center bg-input px-3 lg:flex">
      <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <Input
        type="search"
        defaultValue={current}
        placeholder={placeholder ?? t("in_page_placeholder")}
        aria-label={placeholder ?? t("in_page_placeholder")}
        // 🚨 面を持たせない（`DESIGN.md` §1-1 / §2-8「入力欄に見えるものは、打てること」）。
        //    ヘッダーは平らなので、枠線も背景も持たせず、**打てることは placeholder と caret で示す**。
        className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
        onChange={(event) => apply(event.currentTarget.value)}
      />
    </div>,
    slot,
  );
}

/** portal の行き先。無ければ null（サーバでは常に null）。`page-action.tsx` と同じ形。 */
function useSlot(id: string): HTMLElement | null {
  return useSyncExternalStore(
    () => () => {},
    () => document.getElementById(id),
    () => null,
  );
}
