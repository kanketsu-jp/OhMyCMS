import Link from "next/link";

import { HeaderTabs } from "@/components/admin/header-tabs";
import { cn } from "@/lib/utils";

export type PageTab = {
  /** 押したときの行き先。**同じページの別の見え方**なのでクエリだけが変わる */
  href: string;
  label: string;
  current: boolean;
};

/**
 * ページの中で表示を切り替えるタブ。
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「ヘッダーの直下にはタブが表示できるようにする。このタブは**そのページで下層ページにせず、
 * >   切り替えて表示する場合のもの**。ない場合もある。」
 *
 * 🚨 **リンクにしてある**（クライアントの state で切り替えない）。理由は 3 つ:
 *    - 「未解決を見ている」状態が URL に残る（共有できる・戻れる・再読み込みで消えない）
 *    - サーバ側で必要なぶんだけ取れる（全部取ってから隠す形にしない）
 *    - ページ本体をサーバ側のままにできる
 *
 * 🚨 置き場所: 堀池さんの指示は「**ヘッダーの直下**」。2026-08-15 に `HeaderTabs` で繋いだ。
 *    ページ側は今までどおり `<PageTabs>` を置くだけでよく、**行き先はここが決める**
 *    （3 つのページに同じ包み方を書かせない。書かせると、次に足す人が忘れる）。
 *
 *    🚨 それまでは「置き場所は在るのに誰も繋いでいない」状態だった——
 *    `HeaderTabs` を import しているファイルは**自分自身のみ（0 件）**で、
 *    🟢 対照: 同じ探し方で `PageTabs` は 3 件。**部品が在ることは、使われていることではない。**
 *
 * 🚨 罫線は**ここが持つ**（design 判定・2026-08-15）。`layout.tsx` の帯には持たせない。
 *    下の `-mb-px border-b-2` が**この `border-b` に重ねる**形なので、ここから外すと
 *    選択中の下線が土台を失って浮く。**存在と線が同じ条件で出入りする**のが安全。
 */
export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <HeaderTabs>
    {/* 罫線 1 本で下と区切る。面（背景・枠）は作らない。 */}
    <nav className="flex gap-1 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm",
            tab.current
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
    </HeaderTabs>
  );
}
