"use client";

import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * カード表示と表表示の切り替え。
 *
 * 🚨 **状態は URL に持つ**（`?view=table`）。`localStorage` に隠さない理由:
 *   ・URL を共有すると**相手も同じ見え方**になる
 *   ・リロードしても残る
 *   ・**サーバ側で最初から正しい形を返せる**（読み込んでから切り替わる、が起きない）
 *   （2026-08-15 の規約。schema も同じ結論に着いたので揃えた）
 *
 * 🚨 **`<Link>` で作る**（ボタンにして push しない）。リンクなら
 *   「新しいタブで開く」も「戻る」も**ブラウザの標準の動きがそのまま効く**。
 */
export function FilesViewSwitch({
  view,
  gridHref,
  tableHref,
}: {
  view: "grid" | "table";
  /**
   * それぞれに切り替えたときの行き先。**他のクエリを保つのは呼び出し側の責任**。
   * 🚨 **関数ではなく文字列で受ける。** サーバ側の描画からは**関数を渡せない**
   *    （境界を越えられず 500 になる。実際に踏んだ）。
   */
  gridHref: string;
  tableHref: string;
}) {
  const t = useT("files");

  const item = (target: "grid" | "table", label: string, icon: React.ReactNode) => (
    <Link
      href={target === "table" ? tableHref : gridHref}
      // 🚨 いまの見え方を読み上げにも伝える。見た目の色だけだと、目で見ない人に分からない。
      aria-current={view === target ? "true" : undefined}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md",
        view === target ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground active:text-foreground",
      )}
    >
      {icon}
    </Link>
  );

  return (
    <div className="inline-flex items-center gap-1">
      {item("grid", t("view_grid"), <LayoutGrid className="size-4" />)}
      {item("table", t("view_table"), <List className="size-4" />)}
    </div>
  );
}
