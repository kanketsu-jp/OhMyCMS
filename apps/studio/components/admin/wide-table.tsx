import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 管理画面の一覧表を、横線は画面幅いっぱい・中身は左右に余白ありで見せるためのラッパー。
 *
 * components/ui/table.tsx は 10 ファイルから参照される共有部品なので、この個別要件では編集しない。
 * scroll-fade-x の幅を決める CSS 変数は、表の器（data-slot="table-container"）へ継承されることを実測済み。
 * main の左右余白は負のマージンで打ち消し、first/last のセル padding で「横線は幅いっぱい・中身には余白」を満たす。
 */
export function WideTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "-mx-4 [--scroll-fade-size:min(20%,96px)] md:-mx-8",
        "[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 md:[&_th:first-child]:pl-8 md:[&_td:first-child]:pl-8",
        "[&_th:last-child]:pr-4 [&_td:last-child]:pr-4 md:[&_th:last-child]:pr-8 md:[&_td:last-child]:pr-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
