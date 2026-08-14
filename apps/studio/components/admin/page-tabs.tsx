import Link from "next/link";

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
 * 🚨 置き場所について: 堀池さんの指示は「**ヘッダーの直下**」。ヘッダーは shell が持つので、
 *    枠（差し込み口）が用意されたらそこへ移す。**それまではページの先頭に出す**
 *    （出さないと未解決/解決済みを切り替える手段が無くなるため）。
 */
export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    // 罫線 1 本で下と区切る。面（背景・枠）は作らない。
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
  );
}
