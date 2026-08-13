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

type Props = {
  /** 上位の行き先（設定を除く） */
  items: NavLink[];
  /** 「設定」の中に畳む行き先 */
  settings: NavLink[];
  /** 「設定」の行に出す文字 */
  settingsLabel: string;
  /** 行を押したときに呼ぶ（ドロワーを閉じる用）。サイドバーでは渡さない */
  onNavigate?: () => void;
};

/**
 * 管理画面の行き先リスト。**サイドバー（PC）と下部ナビのドロワー（SP）で同じものを使う**。
 *
 * 🚨 2つに分けて書かないこと。以前は layout.tsx が同じ配列を2箇所へ渡していて、
 * 片方だけ直すと**PC と SP で行き先が食い違う**形になっていた。
 *
 * 🚨 **「設定」は 6 項目あって、平らに並べると上位 5 項目が埋もれる**（design ⑥）。
 * 同じ接頭辞が6回続くのも読みにくい。→ 開閉に畳んで **11行 → 6行**にする。
 *
 * 🚨 **「設定」の行はリンクにしない。** 開閉だけを持たせる
 * （リンクと開閉を兼ねると、押したときにどちらが起きるか分からない）。
 * 🚨 **開閉状態を保存しない。** いま設定の下にいるなら開いた状態で描く。
 * localStorage に覚えさせるより常に正しく、実装も短い。
 */
export function NavLinks({ items, settings, settingsLabel, onNavigate }: Props) {
  const pathname = usePathname();
  const inSettings = pathname.startsWith("/admin/settings");

  const row = (item: NavLink, indent = false) => {
    // /admin は /admin/collections へ転送されるので、特別扱いは要らない（⑰）
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

  return (
    <div className="flex flex-col">
      {items.map((item) => row(item))}
      <Accordion
        // 🚨 いる場所から決める。開閉を覚えさせない
        defaultValue={inSettings ? ["settings"] : []}
        className="border-0"
      >
        <AccordionItem value="settings" className="border-0">
          <AccordionTrigger
            className={cn(
              // 🚨 `items-center` が要る。AccordionTrigger の既定は `items-start` なので、
              // 高さを 44px に揃えても**文字だけ上に張り付いて**、他の行と違って見える
              // （オーナー指摘「設定の高さが違う」の正体。高さは揃っていて、縦の位置がずれていた）。
              // 🚨 accordion.tsx 側は直さない。**本文用のアコーディオンでは items-start が正しい**
              // （複数行の見出しが来たとき、アイコンが上に揃う方が読みやすい）。
              "flex h-(--control-h) items-center rounded-md px-3 py-0 text-sm hover:no-underline md:h-(--control-h-pc)",
              inSettings ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {settingsLabel}
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <div className="flex flex-col">{settings.map((item) => row(item, true))}</div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
