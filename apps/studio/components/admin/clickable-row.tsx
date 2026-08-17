"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { TableRow } from "@/components/ui/table";

/**
 * 行のどこを押しても、その 1 件へ開ける表の行。
 *
 * 🚨 **サーバ側で描く一覧から使うために在る。** `page.tsx` は Server Component なので
 *    `onClick` を書けない。**行だけをここへ切り出し、セルは children でそのまま渡す**
 *    （children はサーバ側で描かれたものがそのまま入る）。
 *
 * 🚨 **押した先が button / a / input なら遷移しない。**
 *    これが無いと、行内の「編集」リンクや削除の ▾ を押しただけで詳細へ飛ぶ。
 *    `files-table.tsx` と同じ守り。
 *
 * 🚨 **リンクは行の中に残すこと。** 行のクリックだけにすると、
 *    新しいタブで開く・キーボードで辿る、が両方できなくなる。
 */
export function ClickableRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <TableRow
      className="cursor-pointer"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a, input")) return;
        router.push(href);
      }}
    >
      {children}
    </TableRow>
  );
}
