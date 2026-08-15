"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string };

export type NavGroup = {
  /** 開閉の識別子（画面には出ない） */
  key: string;
  /** 畳んだ行に出す文字 */
  label: string;
  /** この接頭辞の下に居るときは、開いた状態で描く */
  match: string | string[];
  children: NavLink[];
  /** children が空のときに出す文。無ければ何も出さない */
  emptyMessage?: string | null;
};

export function matchesNavGroup(pathname: string, match: NavGroup["match"]): boolean {
  const prefixes = Array.isArray(match) ? match : [match];
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

type Props = {
  /** 畳まずに並べる行き先 */
  items: NavLink[];
  /** 畳んで持つ組（設定・ファイル・コンテンツ など） */
  groups: NavGroup[];
  /** 行を押したときに呼ぶ（ドロワーを閉じる用）。サイドバーでは渡さない */
  onNavigate?: () => void;
};

/**
 * 管理画面の行き先リスト。**サイドバー（PC）と下部ナビのドロワー（SP）で同じものを使う**。
 *
 * 🚨 2つに分けて書かないこと。以前は layout.tsx が同じ配列を2箇所へ渡していて、
 * 片方だけ直すと**PC と SP で行き先が食い違う**形になっていた。
 *
 * 🚨 **畳む組は「設定」だけではなくなった。** 堀池（2026-08-15）:
 * 「**ファイルはアコーディオンにする**。その中に「ストレージ」「ラベル」」
 * 「**コンテンツはディレクトリで表示できるようにする**」
 * → 組を配列で受け取る形にした。組ごとに専用の分岐を書き足さない。
 *
 * 🚨 **組の行はリンクにしない。** 開閉だけを持たせる
 * （リンクと開閉を兼ねると、押したときにどちらが起きるか分からない）。
 * 🚨 **開閉状態を保存しない。** いまその下にいるなら開いた状態で描く。
 * localStorage に覚えさせるより常に正しく、実装も短い。
 */
export function NavLinks({ items, groups, onNavigate }: Props) {
  const pathname = usePathname();

  const row = (item: NavLink, indent = false) => {
    // /admin は /admin/collections へ転送されるので、特別扱いは要らない
    const current = pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex h-(--control-h) items-center truncate rounded-md text-sm md:h-(--control-h-pc)",
          indent ? "pl-6 pr-3" : "px-3",
          current ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {item.label}
      </Link>
    );
  };

  const open = groups.filter((group) => matchesNavGroup(pathname, group.match)).map((group) => group.key);

  return (
    <div className="flex flex-col">
      {items.map((item) => row(item))}
      {groups.length > 0 ? (
        // 🚨 いる場所から決める。開閉を覚えさせない
        <Accordion defaultValue={open}>
          {groups.map((group) => {
            const inside = matchesNavGroup(pathname, group.match);
            return (
              <AccordionItem key={group.key} value={group.key}>
                <AccordionTrigger
                  className={cn(
                    // 🚨 `items-center` が要る。AccordionTrigger の既定は `items-start` なので、
                    // 高さを 44px に揃えても**文字だけ上に張り付いて**、他の行と違って見える
                    // （オーナー指摘「設定の高さが違う」の正体。高さは揃っていて、縦の位置がずれていた）。
                    // 🚨 accordion.tsx 側は直さない。**本文用のアコーディオンでは items-start が正しい**
                    // （複数行の見出しが来たとき、アイコンが上に揃う方が読みやすい）。
                    "flex h-(--control-h) items-center rounded-md px-3 py-0 text-sm md:h-(--control-h-pc)",
                    inside ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {group.label}
                </AccordionTrigger>
                {/* 🚨 **2026-08-15 に発生源へ移した。** ここで打ち消していたが、
                    `accordion.tsx` 側の既定から下線を外したので不要になった。
                    「読みもの用の本文では下線が正しい」という前の判断は、実測すると
                    **成り立っていなかった**（accordion を使う3箇所に文中リンクは無く、
                    page-info-panel の a はアンカーの行で、行ごと塗って現在地を示す形）。 */}
                <AccordionContent className="pb-0">
                  <div className="flex flex-col">
                    {group.children.length > 0
                      ? group.children.map((item) => row(item, true))
                      : group.emptyMessage
                        ? (
                            <p className="px-6 py-2 text-xs text-muted-foreground">
                              {group.emptyMessage}
                            </p>
                          )
                        : null}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : null}
    </div>
  );
}
